# unimail.js

> unimail's programmatic client

This repository contains an npm module that has both a node library for interfacing with unimail's rendering functions and a CLI wrapper for that library. The CLI is mostly used by the unimail team for internal testing, but there's nothing stopping you from using it for any purpose you see fit.

## Node library

### Installation

npm 5+: (earlier variants add `--save`)

```
npm i unimail
```

yarn:

```
yarn add unimail
```

### API

`unimail` primarily exposes a `.createClient` function that returns a stateful client that handles authentication for you.

For the client to manage authentication, you should provide a token key and token secret using any of the following methods:

- Pass the key and secret in the options in `unimail.createClient` (see below)
- Setting the `UNIMAIL_TOKEN_SECRET` and `UNIMAIL_TOKEN_KEY` environment variables (or set them on `process.env`)
- Exporting the `tokenSecret` and `tokenKey` variables from the unimail config file (see "Config File" section below)

#### createClient

```javascript
const unimail = require('unimail')

// these are the defaults
const options = {
  tokenSecret: process.env.UNIMAIL_TOKEN_SECRET,
  tokenKey: process.env.UNIMAIL_TOKEN_KEY,
  // if the environment variables are not set and the `cache` key
  // is not provided or disabled (by passing `false`)
  // then the cache file defaults to `~/.config/unimail/cache.json`. `~/.config/unimail`
  // will be created if it does not already exist.
  // If `cache` is actively set to `false`, no cache will be used and
  // a new session token will be requested
  cache: process.env.UNIMAIL_CACHE_FILE || `${process.env.XDG_CONFIG_HOME}/unimail/cache.json`,
  // Very similar to the cache option, but we won't create it if it
  // doesn't exist, and it can be either `.js` or `.json` (it gets
  // (`require`d if it exists)
  configFile: process.env.UNIMAIL_CONFIG_FILE || `${process.env.XDG_CONFIG_HOME}/unimail/config`,
  // in verbose mode, we print information such as network requests to the logger
  verbose: false,
  logger: console,
  // if colors are turned on, the verbose output will be colorized with ANSI
  colors: false,
  // you can specify a session key manually, preventing the API from fetching
  // one using your API token. This is useful if you'd like to provide
  // your own session key caching strategy.
  sessionKey: undefined,
}

unimail.createClient(options)
```

#### Client Usage

#### client.templates

`client.templates` represents the template resources associated with your account. It currently has two methods.

`client.templates.index` returns a `Promise` resolving to an array of templates (expressed minimally).

`client.templates.render` takes a template's ID as the first parameter and an options object as the second paramater. At the time of this writing, the only recognized option is `query`, which is an object to add as query parameters to the URL in the request. There is no user facing use for this option at the moment, as it is only used for internal debugging purposes by unimail employees. It returns the html rendered by unimail.

```javascript
const unimail = require('unimail')

async function renderFirstTemplate() {
  // assuming all relevant keys and information are in the default config file
  const client = unimail.createClient()

  const templates = await client.templates.index()
  /*
   * `templates` now looks something like this:
   *   [
   *     { id: 'wQfkzrAgRziqnu3o8', title: 'Template 1' },
   *     { id: 'j2db9LW28pjsb8nh7', title: 'Template 2' },
   *     { id: 'bMrLzuJ3nMnneALn2', title: '...' },
   *   ]
   */

  if (templates.length < 1) {
    console.log('No templates found')
    return
  }

  const html = await client.templates.render(templates[0].id)
  /*
   * `html` is now the string representation of the HTML you can
   * send through your ESP to the recipient
   */
}
```

### CLI

This repository also comes with a CLI if you install it globally. We won't go into detail on the documentation in this README, but it is essentially a wrapper for the API. If you'd like to use it, install it like so:

```
npm i -g unimail
```

or

```
yarn global add unimail
```

and call it using the command `unimail`. `unimail --help` will point you in the right direction if you'd like more information.

### Config File

For both the API and the CLI, a config file is optional but highly recommended. The config file can be specified as either JSON or as a node module. The location is relative to your [XDG_CONFIG_HOME](https://standards.freedesktop.org/basedir-spec/basedir-spec-latest.html), which defaults to `$HOME/.config`. So the default location (on a fresh installation of GNU/Linux with no configuration given to `unimail` in any way) is `$HOME/.config/unimail/<filename>` where `<filename>` can be `config.js` or `config.json`.

The config file should probably just contain your API token details. For example, in a JSON file:

```json
{
  "tokenKey": "<my token key>",
  "tokenSecret": "<my token secret>"
}
```
