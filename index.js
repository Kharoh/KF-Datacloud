const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
const GoogleSpreadsheets = require('google-spreadsheets')

const {client_secret, client_id, redirect_uris} = JSON.parse(fs.readFileSync('./credentials.json')).installed

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

const SCOPES = ['https://www.googleapis.com/auth/drive']

const TOKEN_PATH = 'token.json'

fs.readFile(TOKEN_PATH, (err, token) => {
  if (err) return getAccessToken(oAuth2Client, createDataCloud)
  oAuth2Client.setCredentials(JSON.parse(token))
  createDataCloud(oAuth2Client)
})

function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function createDataCloud(oAuth2Client) {
  GoogleSpreadsheets({
    key: '1GH7uakSPODRQobykuPhnET_YzEZqguHRrFyt4tHyp4s',
    auth: oAuth2Client
  }, function(err, spreadsheet) {
    console.log(spreadsheet)
  })
}

//

