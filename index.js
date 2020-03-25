const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
const GoogleSpreadsheets = require('google-spreadsheets')

/* We use symbols to create private methods */
const _init = Symbol('init')
const _key = Symbol('key')
const _credentials = Symbol('credentials')
const _token = Symbol('token')
const _oAuth2Client = Symbol('oAuth2Client')
const _getAccessToken = Symbol('getAccessToken')
const _saveNewToken = Symbol('saveNewToken')
const _cloudReady = Symbol('isReady')
const _setCloudReady = Symbol('setReady')
const _loadDataCloud = Symbol('openDataCloud')

/**
 * @param {string} options.name - The name of the Cloud Database
 * @param {boolean} options.saveToken - Whether a new retrieved token has to be saved or not
 * 
 * @param {object} credentials - The credentials of a google api app
 * @param {object} token - If there already is, the api token
 * 
 * 
 * @property {boolean} options.saveToken - Whether a new retrieved token has to be saved or not
 */
class Cloud extends Map {
  constructor(options, credentials, token) {
    super()

    if (!options || !credentials) throw new Error('Expected at least two params options and credentials')
    if (!options.name) throw new Error('Expected a Datacloud name in param options')
    if (!options.key) throw new Error('Expected a Datacloud key in param options')

    this.options = {
      saveToken: options.saveToken || false
    }

    this[_key] = options.key
    this[_credentials] = credentials
    this[_token] = token

    /* this promise will be resolved after the loading of the Datacloud, instatiated at the end of init, its fulfill value is the spreadsheet / Datacloud */
    this[_cloudReady] = new Promise((resolve, reject) => {
      this[_setCloudReady] = resolve
    })

    this[_init]()
  }

  async [_init] () {
    const { client_secret, client_id, redirect_uris } = JSON.parse(credentials).installed
    this[_oAuth2Client] = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    if (this[_token]) this[_oAuth2Client].setCredentials(JSON.parse(this[_token]))
    else {
      let newToken

      if (fs.existsSync('./token.json')) newToken = fs.readFileSync('./token.json')
      else {
        newToken = await this[_getAccessToken]()
        if (this.options.saveToken) this[_saveNewToken](newToken)
      }

      this[_oAuth2Client].setCredentials(JSON.parse(newToken))
    }

    this[_loadDataCloud]()
  }

  [_getAccessToken] () {
    return new Promise((resolve, reject) => {
      const authUrl = this[_oAuth2Client].generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive']
      })

      console.log('Authorize this app by visiting this url: ', authUrl)

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      rl.question('Enter the code from that page here: ', (code) => {
        rl.close()
        this[_oAuth2Client].getToken(code, (err, token) => {
          if (err) throw new Error('Error retrieving access token', err)
          else resolve(token)
        })
      })
    })
  }

  [_saveNewToken] (newToken) {
    fs.writeFile('./token.json', JSON.stringify(newToken), (err) => {
      if (err) return console.error(err)
    })
  }

  [_loadDataCloud] () {
    GoogleSpreadsheets({
      key: this[_key],
      auth: this[_oAuth2Client]
    }, 
    
    (err, spreadsheet) => {
      if (err) throw new Error('Encountered a problem while loading the spreadsheet', err)
      this[_setCloudReady](spreadsheet)
    })
  }

  /* get pseudo code : 
    set (path) {
      super.set(...)

      this[_cloudReady].then(spreadsheet => {
        spreadsheet.addRow(...)
      })  
    }
  */

}

module.exports = Cloud


// const options = {
//   name: 'test',
//   key: '1GH7uakSPODRQobykuPhnET_YzEZqguHRrFyt4tHyp4s',
//   saveToken: true,
// }

// const credentials = fs.readFileSync('./credentials.json')

// const database = new Cloud(options, credentials)
