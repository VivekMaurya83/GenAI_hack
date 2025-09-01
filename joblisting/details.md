## Adzuna API Setup  

1. **Register an account**  
   - Go to the official Adzuna Developer website: [https://developer.adzuna.com/](https://developer.adzuna.com/).  
   - Sign up for a free account.  

2. **Get your API credentials**  
   - After logging in, navigate to your **Dashboard**.  
   - You will find your **App ID** and **App Key** (API Key).  

3. **Update your project**  
   - Open the `main.py` file in your project.  
   - Replace the placeholder values of `ADZUNA_APP_ID` and `ADZUNA_API_KEY` with your actual credentials from the dashboard:  

   ```python
   ADZUNA_APP_ID = "your_app_id_here"
   ADZUNA_API_KEY = "your_api_key_here"
