const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
const _ = require('lodash')

/* We use symbols to create private methods since they are all instatiated during initialization, they will be deleted after it by the garbage collector */
const _init = Symbol('init')
const _setCloudReady = Symbol('setCloudReady')
const _loadDataCloud = Symbol('openDataCloud')

/**
 * We define some methods and variables externally to make them private and to not log them in the console while logging Cloud
 * @private {google.auth.OAuth2} _oAuth2Client - The oAuth2Client used to log and use the spreadsheets
 * 
 * @private {promise} _createOAuth2Client - Function used to create an OAuth2Client when the credentials are given, get called as a private method and can access this
 * @private {function} _getAccessToken - When no token is directly provided in the constructor we call this function to generate a token via a link in the console
 * @private {function} _saveNewToken - 
 */
let _oAuth2Client

async function _createOAuth2Client (credentials, token) {
  const { client_secret, client_id, redirect_uris } = JSON.parse(credentials).installed
  _oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  if (token) _oAuth2Client.setCredentials(JSON.parse(token))
  else {
    let newToken

    if (fs.existsSync('./token.json')) newToken = JSON.parse(fs.readFileSync('./token.json'))
    else {
      newToken = await _getAccessToken.call(this)
      if (this.options.saveToken) _saveNewToken.call(this, newToken)
    }

    _oAuth2Client.setCredentials(newToken)
  }

  return
}

function _getAccessToken () {
  return new Promise((resolve, reject) => {
    const authUrl = _oAuth2Client.generateAuthUrl({
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
      _oAuth2Client.getToken(code, (err, token) => {
        if (err) throw new Error('Error retrieving access token', err)
        else resolve(token)
      })
    })
  })
}

function _saveNewToken (newToken) {
  fs.writeFile('./token.json', JSON.stringify(newToken), (err) => {
    if (err) return console.error(err)
  })
}

let sheets

let _spreadsheet

let _keyRowNumbers = []

async function _spreadsheetSet(key, value) {
  if (typeof value === 'object') value = JSON.stringify(value)

  const spreadsheetId = _spreadsheet.data.spreadsheetId
  const range = 'B' + (_keyRowNumbers.indexOf(key) + 2)

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[value]]
    }
  })
}

async function _spreadsheetAppend(key, value) {
  if (typeof value === 'object') value = JSON.stringify(value)

  _keyRowNumbers.push(key)

  const spreadsheetId = _spreadsheet.data.spreadsheetId
  const range = 'A' + (_keyRowNumbers.length + 1)

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[key, value]]
    }
  })
}

async function _spreadsheetDelete(key) {
  console.log(_keyRowNumbers)
  const index = _keyRowNumbers.indexOf(key)

  _keyRowNumbers.splice(index, 1)

  const spreadsheetId = _spreadsheet.data.spreadsheetId

  console.log(index, _keyRowNumbers)

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: 'ROWS',
              startIndex: index + 1,
              endIndex: index + 2
            }
          }
        }
      ]
    }
  })
}

async function _spreadsheetDeleteAll() {
  const spreadsheetId = _spreadsheet.data.spreadsheetId

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: 'ROWS',
              startIndex: 1,
              endIndex: _keyRowNumbers.length + 1
            }
          }
        }
      ]
    }
  })

  _keyRowNumbers = []
}

/**
 * @param {string} options.name - The name of the Cloud Database
 * @param {boolean} options.saveToken - Whether a new retrieved token has to be saved or not
 * 
 * @param {google.auth.OAuth2} authInformations.auth - An oAuth2Client already created with the right scopes and the token
 * @param {object} authInformations.credentials - The credentials to needed to log an oAuth2Client if no auth was provided
 * @param {object} authInformations.token - The token needed to access the scope of the sheets, if there is no client specified and the token is not given, it will be automatically asked
 * 
 * @param {object} credentials - The credentials of a google api app
 * @param {object} token - If there already is, the api token
 * 
 * 
 * @property {boolean} options.saveToken - Whether a new retrieved token has to be saved or not
 */
class Cloud extends Map {
  constructor(options, authInformations) {
    super()

    if (!options || !authInformations) throw new Error('Expected at least two params options and authInformations')
    if (!options.name) throw new Error('Expected a Datacloud name in param options')
    if (!options.key) throw new Error('Expected a Datacloud key in param options')

    if (!authInformations.auth && !authInformations.credentials) throw new Error('Expected credentials in param authInformation when no OAuth2Client provided')

    this.options = {
      saveToken: options.saveToken || false
    }

    /* This promise will be resolved after the loading of the Datacloud, instatiated at the end of init, its fulfill value is the spreadsheet / Datacloud */
    this.isReady = new Promise((resolve, reject) => {
      this[_setCloudReady] = resolve
    })

    this[_init](authInformations, options.key)
  }

  async [_init] ({ auth, credentials, token }, key) {
    if (auth) _oAuth2Client = auth
    else {
      await _createOAuth2Client.call(this, credentials, token)
    }

    this[_loadDataCloud](key)
  }

  async [_loadDataCloud] (key) {
    sheets = google.sheets({
      version: 'v4',
      auth: _oAuth2Client
    })

    _spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: key,
      includeGridData: true,
    })

    this.fetchEverything()
    this[_setCloudReady](_spreadsheet)
    delete this[_setCloudReady]
  }

  fetchEverything() {
    const datasheet = _spreadsheet.data.sheets[0] // we could ask the user as a parameter what sheet he wants

    for (let i = 0; i < datasheet.properties.gridProperties.rowCount - 1; i++) {
      try {
        const rowDataValues = datasheet.data[0].rowData[i + 1].values
      
        const mapKey = rowDataValues[0].formattedValue
        let mapValue
        try { mapValue = JSON.parse(rowDataValues[1].formattedValue) } catch (e) { mapValue = rowDataValues[1].formattedValue }

        _keyRowNumbers.push(mapKey)
        super.set(mapKey, mapValue)
      } catch(e) {}
    }
  }

  get(key, path) {
    const value = super.get(key)
    if (typeof value !== 'object' || !path) return value
    return _.get(value, path)
  }

  ensure(key, path, defaultValue) {
    if (arguments.length === 2) [key, defaultValue] = arguments
    else if (arguments.length === 3) [key, path, defaultValue] = arguments

    const value = super.get(key)
    if (value === undefined) return defaultValue
    else if (typeof value !== 'object') return value
    else return _.get(value, path, defaultValue)
  }

  async set(key, path, value) {
    if (arguments.length === 2) [key, value, path] = arguments
    if (arguments.length === 3) [key, path, value] = arguments

    if (value === undefined) throw new Error('You should never set undefined value')

    const currentValue = super.get(key)

    let newValue
    if (path) {
      if (_.isPlainObject(currentValue)) {
        newValue = currentValue
        _.set(newValue, path, value)
      } else {
        newValue = {}
        _.set(newValue, path, value)
      }
    } else {
      newValue = value
    }

    super.set(key, newValue)

    if (currentValue !== undefined) await _spreadsheetSet(key, newValue)
    else await _spreadsheetAppend(key, newValue)
  }

  async delete(key, path) {
    const currentValue = super.get(key)
    if (currentValue === undefined) return
    if (path && !_.isPlainObject(currentValue)) throw new Error('You should only specify path when the value stored is an object')

    if (path) {
      _.unset(currentValue, path)
      await this.set(key, currentValue)
    }

    /* if there is no path, we want to delete the whole row */
    else {
      super.delete(key)
      await _spreadsheetDelete(key)
    }
  }

  async deleteAll() {
    super.forEach((value, key) => {
      super.delete(key)
    })

    await _spreadsheetDeleteAll()
  }

}

module.exports = Cloud

async function main () {
  const options = {
    name: 'test',
    key: '1JH6TWZmaEAR3OUnRVcKZTjCprR1D0xDxtld6XECm47Y',
    saveToken: true,
  }
  
  const credentials = fs.readFileSync('./credentials.json')
  
  const database = new Cloud(options, { credentials })

  await database.isReady

  await database.set('689800000624001043', 'username', 'Nathan')
  await database.set('567437206579314730', 'Lucas K')

}
  
main()

