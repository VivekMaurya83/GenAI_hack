import os
import sys
import json
import re
from typing import Optional, Tuple, Dict, Any, List

import firebase_admin
from firebase_admin import firestore

def _stringify_list_content(content) -> str:
    """Safely converts a list of strings or dicts into a single newline-separated string."""
    if not isinstance(content, list): return str(content or "")
    string_parts = []
    for item in content:
        if isinstance(item, str): string_parts.append(item)
        elif isinstance(item, dict):
            string_parts.append(", ".join([f"{k.replace('_', ' ').title()}: {v}" for k, v in item.items()]))
        else: string_parts.append(str(item))
    return "\n".join(string_parts)

class DatabaseManager:
    """
    Handles all interactions with the Firebase Firestore database.
    Assumes Firebase Admin SDK has already been initialized by main.py.
    """

    _standard_to_db_collections_map = {
        'work_experience': 'work_experiences',
        'education': 'education',
        'projects': 'projects',
        'internships': 'internships',
        'certifications': 'certifications',
        'skills': 'skills',
        'additional_sections': 'additional_sections'
    }

    _ai_key_to_standard_map = {
        'personal_info': ['personal_info'],
        'summary': ['summary'],
        'work_experience': ['work_experience', 'professional_experience', 'experience', 'work_history'],
        'education': ['education', 'academic_background'],
        'projects': ['projects', 'personal_projects'],
        'internships': ['internships', 'internship_experience'],
        'certifications': ['certifications', 'licenses_&_certifications'],
        'skills': ['skills'],
    }

    def __init__(self):
        """
        Initializes the DatabaseManager.
        It expects firebase_admin.initialize_app() to have been called already by main.py.
        """
        try:
            # This line will only work if the Firebase app is already initialized.
            self.db = firestore.client()
            # print("✅ DatabaseManager initialized and Firestore client obtained.") # Debug print
        except Exception as e:
            # This indicates an issue getting the client, likely due to an uninitialized app
            print(f"❌ ERROR: DatabaseManager failed to get Firestore client. Is Firebase Admin SDK initialized? {e}")
            # Do NOT sys.exit(1) here in a dependency, let the main app handle it.
            # Raise the exception so FastAPI can catch it and provide a 500 error,
            # or main.py's initialization check will have already exited.
            raise 

    def _map_ai_section_to_standard_key(self, ai_key: str) -> Optional[str]:
        normalized_key = ai_key.lower().replace(" ", "_").replace("-", "_")
        for standard_key, variations in self._ai_key_to_standard_map.items():
            if normalized_key in variations: return standard_key
        return None
    
    def fetch_resume_relational(self, user_uid: str, get_optimized: bool = False) -> Optional[Dict[str, Any]]:
        user_doc_ref = self.db.collection('users').document(user_uid)
        user_doc = user_doc_ref.get()

        if not user_doc.exists:
            print(f"User document with UID {user_uid} not found.")
            return None

        user_data = user_doc.to_dict()
        resume_data: Dict[str, Any] = {}

        personal_info = {
            'name': user_data.get('name'),
            'email': user_data.get('email'),
            'phone': user_data.get('phone'),
            'linkedin': user_data.get('linkedin'),
            'github': user_data.get('github')
        }
        if any(v for v in personal_info.values() if v is not None and v != ''):
            resume_data['personal_info'] = personal_info

        resume_map = user_data.get('resume', {})
        
        summary_to_use = (
            resume_map.get('optimized_summary')
            if get_optimized and resume_map.get('optimized_summary')
            else resume_map.get('summary')
        )
        if summary_to_use:
            resume_data['summary'] = summary_to_use
        
        file_name = resume_map.get('file_name')
        if file_name:
            resume_data['resume_metadata'] = {'file_name': file_name}

        for standard_key, collection_name in self._standard_to_db_collections_map.items():
            if standard_key in ['skills', 'additional_sections']:
                continue 
            
            docs = user_doc_ref.collection(collection_name).stream()
            data_list = []
            for doc in docs:
                item_data = doc.to_dict()
                desc_to_use = (
                    item_data.get('optimized_description')
                    if get_optimized and item_data.get('optimized_description')
                    else item_data.get('description')
                )
                
                item = {k: v for k, v in item_data.items() if k not in ['optimized_description', 'description']}
                
                if desc_to_use:
                    item['description'] = desc_to_use.split('\n') if isinstance(desc_to_use, str) else desc_to_use
                
                data_list.append(item)
            if data_list:
                resume_data[standard_key] = data_list

        docs = user_doc_ref.collection(self._standard_to_db_collections_map['skills']).stream()
        skills_dict: Dict[str, Any] = {}
        for doc in docs:
            item = doc.to_dict()
            category = item.get('category')
            skill_name = item.get('skill_name')
            if category and skill_name:
                if category not in skills_dict:
                    skills_dict[category] = []
                skills_dict[category].append(skill_name)
        if skills_dict:
            resume_data['skills'] = skills_dict;

        docs = user_doc_ref.collection(self._standard_to_db_collections_map['additional_sections']).stream()
        for doc in docs:
            item = doc.to_dict()
            desc_to_use = (
                item.get('optimized_description')
                if get_optimized and item.get('optimized_description')
                else item.get('description')
            )
            section_name = item.get('section_name')
            if section_name and desc_to_use:
                resume_data[section_name] = desc_to_use.split('\n') if isinstance(desc_to_use, str) else desc_to_use

        return {k: v for k, v in resume_data.items() if v}

    def update_resume_relational(self, user_uid: str, file_name: Optional[str], parsed_data: Dict[str, Any]) -> bool:
        try:
            user_doc_ref = self.db.collection('users').document(user_uid)
            
            user_doc_ref.set({'lastUpdatedAt': firestore.SERVER_TIMESTAMP}, merge=True)
            print(f" -> Ensured user document exists for {user_uid}")

            collections_to_delete = list(self._standard_to_db_collections_map.values())
            for coll_name in collections_to_delete:
                docs = user_doc_ref.collection(coll_name).stream()
                for doc in docs:
                    doc.reference.delete()
            print(f" -> Cleared old resume sub-collections for user {user_uid}")

            p_info = parsed_data.get('personal_info', {})
            
            update_fields = {
                'name': p_info.get('name'),
                'email': p_info.get('email'),
                'phone': p_info.get('phone'),
                'linkedin': p_info.get('linkedin'),
                'github': p_info.get('github'),
                'resume.file_name': file_name,
                'resume.summary': parsed_data.get('summary'),
                'resume.optimized_summary': None,
                'lastUpdatedAt': firestore.SERVER_TIMESTAMP
            }

            filtered_update_fields = {k: v for k, v in update_fields.items() if v is not None}
            if 'resume' in filtered_update_fields and isinstance(filtered_update_fields['resume'], dict):
                filtered_update_fields['resume'] = {k: v for k, v in filtered_update_fields['resume'].items() if v is not None}
            
            user_doc_ref.update(filtered_update_fields)
            print(f" -> Updated main user document for {user_uid} with personal info and resume summary/filename.")

            for ai_section_key, section_content in parsed_data.items():
                if ai_section_key in ['personal_info', 'summary', 'skills', 'resume_metadata']:
                    continue
                
                standard_key = self._map_ai_section_to_standard_key(ai_section_key)
                
                if standard_key and standard_key in self._standard_to_db_collections_map:
                    collection_name = self._standard_to_db_collections_map[standard_key]
                    if isinstance(section_content, list):
                        for item in section_content:
                            if isinstance(item, dict):
                                item_to_save = item.copy()
                                if 'description' in item_to_save:
                                    item_to_save['description'] = _stringify_list_content(item_to_save['description'])
                                item_to_save['optimized_description'] = None
                                user_doc_ref.collection(collection_name).add(item_to_save)
                else: # For custom/additional sections
                    description = _stringify_list_content(section_content)
                    user_doc_ref.collection(self._standard_to_db_collections_map['additional_sections']).add({
                        'section_name': ai_section_key,
                        'description': description,
                        'optimized_description': None
                    })
            
            if 'skills' in parsed_data and isinstance(parsed_data['skills'], dict):
                for category, skill_list in parsed_data['skills'].items():
                    if isinstance(skill_list, list):
                        for skill_name in skill_list:
                            user_doc_ref.collection(self._standard_to_db_collections_map['skills']).add({'category': category, 'skill_name': skill_name})
            
            print(f" -> Successfully re-inserted new resume sub-collection data for user {user_uid}.")
            return True

        except Exception as e:
            print(f"Error updating resume for user {user_uid}: {e}")
            return False

    def update_optimized_resume_relational(self, user_uid: str, optimized_data: Dict[str, Any]):
        user_doc_ref = self.db.collection('users').document(user_uid)

        if 'summary' in optimized_data:
            user_doc_ref.update({'resume.optimized_summary': optimized_data['summary']})
        
        def update_item_optimized_description(collection_name: str, items: list, match_keys: list):
            for item_to_match in items:
                optimized_desc_str = _stringify_list_content(item_to_match.get('description', []))
                
                query = user_doc_ref.collection(collection_name)
                for key in match_keys:
                    if item_to_match.get(key):
                        query = query.where(key, '==', item_to_match.get(key))
                
                docs = query.limit(1).stream()
                for doc in docs:
                    doc.reference.update({'optimized_description': optimized_desc_str})

        if 'work_experience' in optimized_data: update_item_optimized_description(self._standard_to_db_collections_map['work_experience'], optimized_data['work_experience'], ['role', 'company'])
        if 'education' in optimized_data: update_item_optimized_description(self._standard_to_db_collections_map['education'], optimized_data['education'], ['institution', 'degree'])
        if 'projects' in optimized_data: update_item_optimized_description(self._standard_to_db_collections_map['projects'], optimized_data['projects'], ['title'])
        if 'internships' in optimized_data: update_item_optimized_description(self._standard_to_db_collections_map['internships'], optimized_data['internships'], ['role', 'company'])
        if 'certifications' in optimized_data: update_item_optimized_description(self._standard_to_db_collections_map['certifications'], optimized_data['certifications'], ['name'])

        for key, content in optimized_data.items():
            if self._map_ai_section_to_standard_key(key) is None and key not in ['personal_info', 'summary', 'skills', 'resume_metadata']:
                optimized_desc_str = _stringify_list_content(content)
                docs = user_doc_ref.collection(self._standard_to_db_collections_map['additional_sections']).where('section_name', '==', key).limit(1).stream()
                for doc in docs:
                    doc.reference.update({'optimized_description': optimized_desc_str})
        
        user_doc_ref.update({'lastUpdatedAt': firestore.SERVER_TIMESTAMP})
        print(f" -> Optimized data for user UID {user_uid} has been fully updated in Firestore.")

    def close_connection(self):
        pass