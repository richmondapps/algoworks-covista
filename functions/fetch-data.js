const { GoogleAuth } = require('google-auth-library');

async function fetchSecureFunction() {
  const targetAudience = 'https://us-central1-dev-wu-agenticai-app-proj.cloudfunctions.net/exportQAData';
  const auth = new GoogleAuth();
  
  try {
    const client = await auth.getIdTokenClient(targetAudience);
    console.log("Acquired token, fetching from Cloud Function...");
    const response = await client.request({
      url: targetAudience,
      method: "GET"
    });
    
    const fs = require('fs');
    fs.writeFileSync('../sample_10_students.json', JSON.stringify(response.data, null, 2));
    console.log("✅ Successfully downloaded 10 records to sample_10_students.json!");
  } catch (err) {
    console.error("Failed to execute securely:", err.message);
  }
}

fetchSecureFunction();
