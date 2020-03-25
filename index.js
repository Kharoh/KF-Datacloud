const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')

/* We use symbols to create private methods */
const _init = Symbol('init')
const _key = Symbol('key')
const _credentials = Symbol('credentials')
const _token = Symbol('token')
const _oAuth2Client = Symbol('oAuth2Client')
const _getAccessToken = Symbol('getAccessToken')
const _saveNewToken = Symbol('saveNewToken')
const _setCloudReady = Symbol('setReady')
const _loadDataCloud = Symbol('openDataCloud')

// we need to extract the private methods as functions and call them inside Cloud using init.call(this, arg) for example, to disable the log they provide
// OR DELETE THE PROPERTIES AFTER INIT

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

    /* this promise will be resolved after the loading of the Datacloud, instatiated at the end of init, its fulfill value is the spreadsheet / Datacloud */
    this.isReady = new Promise((resolve, reject) => {
      this[_setCloudReady] = resolve
    })

    this[_init](credentials, token)
  }

  async [_init] (credentials, token) {
    const { client_secret, client_id, redirect_uris } = JSON.parse(credentials).installed
    this[_oAuth2Client] = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    if (token) this[_oAuth2Client].setCredentials(JSON.parse(token))
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

  async [_loadDataCloud] () {
    const sheets = await google.sheets({
      version: 'v4',
      auth: this[_oAuth2Client]
    })

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this[_key],
      includeGridData: true,
    })

    this.fetchEverything(spreadsheet)
    this[_setCloudReady](spreadsheet)
  }

  fetchEverything(spreadsheet) {
    const datasheet = spreadsheet.data.sheets[0] // we could ask the user as a parameter what sheet he wants

    for (let i = 0; i < datasheet.properties.gridProperties.rowCount; i++) {
      const rowDataValues = datasheet.data[0].rowData[i].values
      
      const mapKey = rowDataValues[0].effectiveValue.stringValue
      let mapValue
      try { mapValue = JSON.parse(rowDataValues[1].effectiveValue.stringValue) } catch (e) { mapValue = rowDataValues[1].effectiveValue.stringValue }

      super.set(mapKey, mapValue)
    }
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





async function main () {
  const options = {
    name: 'test',
    key: '1JH6TWZmaEAR3OUnRVcKZTjCprR1D0xDxtld6XECm47Y',
    saveToken: true,
  }
  
  const credentials = fs.readFileSync('./credentials.json')
  
  const database = new Cloud(options, credentials)

  const spreadsheet = await database.isReady

  console.log(database)
}

main()
