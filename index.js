const fs = require('fs')
const path = require('path')
const axios = require('axios')
const snakeCase = require('lodash/fp/snakeCase')
const assignIn = require('lodash/fp/assignIn')
const mkdirp = require('mkdirp')

const supportEmail = 'support@unimail.co'
const uptimeMonitor = 'uptime.unimail.co'
const errorPrelude = 'unimail API Error:'

const env = process.env

const defaultConfigFileBase = env.UNIMAIL_CONFIG_FILE = (() => {
  const home = os.homedir()
  const xdgConfigHome = env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : null)
  return path.join(xdgConfigHome, 'unimail', 'config')
})()

const cacheFileName = env.UNIMAIL_CACHE_FILE || (() => {
  const home = os.homedir()
  const xdgConfigHome = env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : null)
  return path.join(xdgConfigHome, 'unimail', 'cache.json')
})()

const defaultConfig = {
  host: 'api.unimail.co',
  port: 80,
  protocol: 'https',
  cache: cacheFileName,
}

// cache session token (and maybe other stuff later) in the file system
// every operation reads or writes to the file system synchronously, possibly multiple times,
// so use sparingly
class CacheManager {
  constructor(filename, key, secret) {
    this.filename = filename
    this.key = this.constructor.hash(key + secret)
  }

  static hash(str) {
    let hash = 0
    if (str.length === 0) return hash
    for (let i = 0; i < str.length; ++i) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
    }

    return hash.toString(16)
  }

  get(key) {
    const { filename } = this
    if (!fs.existsSync(filename)) {
      return null
    }

    const contents = require(filename)
    if (!contents[this.key]) {
      return null
    }

    return contents[this.key][key]
  }

  set(key, value) {
    const { filename } = this
    if (!fs.existsSync(filename)) {
      mkdirp.sync(path.dirname(filename))
      fs.writeFileSync(filename, '{}')
    }

    const currentContents = require(filename)
    currentContents[this.key] = currentContents[this.key] || {}
    currentContents[this.key][key] = value

    fs.writeFileSync(filename, JSON.stringify(currentContents, null, 2))
  }
}

class TemplateResource {
  constructor(client) {
    this.client = client
  }
}

class UnimailClient {
  constructor(options = {}) {
    const configFileBase = options['configFile'] || defaultConfigFileBase
    const configFileName = ((() => {
      if (fs.existsSync(configFileBase)) {
        return configFileBase
      } else if (fs.existsSync(`${configFileBase}.json`)) {
        return `${configFileBase}.json`
      } else if (fs.existsSync(`${configFileBase}.js`)) {
        return `${configFileBase}.js`
      }
    })())

    this.configFileName = configFileName

    this.options = options

    this.templates = new TemplateResource(this)
    const cacheFile = this.getConfigValue('cache')
    if (cacheFile) {
      this.cache = new CacheManager(cacheFile, this.getConfigValue('tokenKey'), this.getConfigValue('tokenSecret'))
    }
  }

  get config() {
    if (this._config) {
      return this._config
    }

    if (this.configFileName) {
      this._config = assignIn(defaultConfig, require(this.configFileName))
      return this._config
    }

    return defaultConfig
  }

  getConfigValue(key, {
    required = true,
  } = {}) {
    const envKey = `UNIMAIL_${snakeCase(key)}`.toUpperCase()
    const value = this.options[key] || env[envKey] || this.config[key]
    if (!value && required) {
      const configFileMessage =
        this.configFileName ?
          `(currently located at ${this.configFileName})`
          : `(not created; defaults to ${defaultConfigFileBase}.js or ${defaultConfigFileBase}.json)`
      throw new Error(`${errorPrelude} Missing required configuration value for key \`${key}\`
Specify by:
  - Passing "${key}" as a key in a config object when creating the client
  - Setting the "${envKey}" environment variable
  - Exporting the variable \`${key}\` from the unimail config file ${configFileMessage}`)
    }

    return value
  }

  getBaseURL() {
    return `${this.getConfigValue('protocol')}://${this.getConfigValue('host')}:${this.getConfigValue('port')}`
  }

  /**
   * If we already have a cached session key, return it.
   * If we don't, fetch one from the unimail API.
   * parameter `force` will force a fetch
   */
  async _getSessionKey(force = false) {
    if (this.getConfigValue('sessionKey', { required: false })) {
      return this.getConfigValue('sessionKey')
    }

    if (!force && !this._sessionKey && this.cache) {
      const cachedSessionKey = this.cache.get('sessionKey')
      if (cachedSessionKey) {
        return cachedSessionKey
      }
    }

    if (!this._sessionKey || force) {
      const response = await axios({
        method: 'post',
        url: '/v1/sessions',
        data: {
          key: this.getConfigValue('tokenKey'),
          secret: this.getConfigValue('tokenSecret'),
        },
        baseURL: this.getBaseURL(),
      })

      if (response.data && response.data.sessionToken) {
        this._sessionKey = response.data.sessionToken

        if (this.cache) {
          this.cache.set('sessionKey', this._sessionKey)
        }
      }
    }

    if (this._sessionKey) {
      return this._sessionKey
    }

    throw new Error(`${errorPrelude} Could not get session token for some reason; could be a unimail issue. Please report this incident to ${supportEmail}. Thank you for your patience.`)
  }

  getSessionKey(force) {
    return this._catchCommonErrors(() => this._getSessionKey(force), 'getting a session key')
  }

  async _catchCommonErrors(fn, actionGerund) {
    try {
      return await fn()
    } catch (e) {
      if (e.status && e.status === 401) {
        throw new Error(`${errorPrelude} Provided API Key and Secret are invalid.`)
      }

      if (e.code && e.code === 'ENOTFOUND') {
        throw new Error(`${errorPrelude} ${this.getBaseURL()} did not resolve. Check your internet connection and DNS settings and check the URL. If everything seems in order, check ${uptimeMonitor}. If ${uptimeMonitor} is not responding and your internet seems to be working fine, please report this incident to ${supportEmail}. Thank you for your patience.`)
      }

      if (e.code && e.code === 'ECONNREFUSED') {
        throw new Error(`${errorPrelude} Connection refused by server. Check your internet connection.
If your connection is fine, the unimail API could be down. Check ${uptimeMonitor} for status reports.
This could also be a configuration issue on the client end. The API URL you're using is ${this.getBaseURL()}`)
      }

      const context = actionGerund ? ` while ${actionGerund}` : ''

      if (e.response && e.response.data && e.response.data.error) {
        throw new Error(`${errorPrelude}${context && `${context},`} server responded with ${e.response.status}. Server says "${e.response.data.error}".`)
      }


      console.error(`${errorPrelude} Unknown exception emerged${context}. The unimail API client endeavors to handle all exceptions gracefully and with a sane explanation, but we were unable to do so in this case. Please report this incident to ${supportEmail} so we can resolve this issue. Thank you for your patience.`)
      throw e
    }
  }

  async withSessionKey(fn) {
    const sessionKey = await this.getSessionKey()
    try {
      return await this._catchCommonErrors(() => fn(sessionKey))
    } catch (e) {
      console.error(e)
      throw e
    }
  }
}

module.exports = {
  createClient(options) {
    return new UnimailClient(options)
  }
}
