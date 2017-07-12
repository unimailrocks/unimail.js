#!/usr/bin/env node

const program = require('commander')
const Table = require('cli-table2')
const inquirer = require('inquirer')
const path = require('path')
const os = require('os')
const cp = require('child_process')
const shellescape = require('shell-escape')
const cheerio = require('cheerio')
const colors = require('colors/safe')
const unimail = require('./index')
const { version } = require('./package.json')

const { env } = process

program
  .version(version)

const defaultConfigFileIdentifier = env.UNIMAIL_CONFIG_FILE || (() => {
  const home = os.homedir()
  const xdgConfigHome = env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : null)
  return path.join(xdgConfigHome, 'unimail', 'config')
})() + '.(js|json)'

const cacheFileName = env.UNIMAIL_CACHE_FILE || (() => {
  const home = os.homedir()
  const xdgConfigHome = env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : null)
  return path.join(xdgConfigHome, 'unimail', 'cache.json')
})()

// Pretty much just puts the default options on and provides what
// I think is a nicer API but really irrelevant
function apiCommand({
  name,
  description,
  options,
  action,
}) {
  const cmd = program
    .command(name)
    .description(description)
    .option('-c, --config <file>', `Specify the config file to use (defaults to ${defaultConfigFileIdentifier})`)
    .option('-f, --cache <file>', `Specify the cache file for session tokens to use (defaults to ${cacheFileName})`)
    .option('-F, --no-cache', 'Don\'t use a cache file (request a new session token every time)')

  options.forEach(o => {
    cmd.option(o.specifier, o.description)
  })

  cmd.action(options => {
    const cacheOption = options['no-cache'] ? false : options.cache
    const cache = typeof cacheOption === 'string' || cacheOption === false ? cacheOption : undefined
    const client = unimail.createClient({
      verbose: options.verbose || options.network,
      color: true,
      cache,
      configFile: options.config,
    })

    options.client = client
    return action(options)
  })
}

/* COMMAND: TEMPLATES */
apiCommand({
  name: 'templates',
  description: 'List all unimail templates',
  options: [{
    specifier: '-v, --verbose',
    description: 'Verbose',
  }],
  async action(options) {
    const { client } = options
    const templates = await client.templates.index()
    const table = new Table({
      style: { 'padding-left': 2, 'padding-right': 2 },
    })

    const header =
      [
        { hAlign: 'center', content: '#' },
        { hAlign: 'center', content: colors.blue.bold('ID') },
        { hAlign: 'center', content: colors.blue.bold('Title') }
      ]

    const title = [{ hAlign: 'center', content: colors.bold('unimail templates') + colors.green(` (${templates.length}) `), colSpan: header.length }]

    table.push(title)
    table.push(header)

    const foregrounds = ['white', 'grey']
    templates.forEach((t, i) => {
      const index = i % 2
      const fg = foregrounds[index]
      const colored = colors[fg]
      table.push({
        [i + 1]: [
          colored(t.id), colored(t.title)
        ]
      })
    })

    console.log()
    console.log(table.toString().replace(/(^|\n)/g, '$1\t'))
    console.log()
  }
})

/* COMMAND: RENDER */
apiCommand({
  name: 'render',
  description: 'Render an email template to HTML',
  options: [
    { specifier: '-v, --verbose', description: 'Verbose (debug information -- ignores "--silent" option)'},
    { specifier: '-o, --open', description: 'Open the HTML as a file'},
    { specifier: '-x, --autoclose [time]', description: 'Auto close the HTML after some number of seconds (defaults to 5)'},
    // for unimail employees to test server development
    { specifier: '-d, --debug <debug>', description: 'Ask the server to print debug information'},
    { specifier: '-s, --silent', description: 'Do not print normal output (does not cancel "--verbose" option)'},
    { specifier: '-n, --network', description: 'Show network requests'},
    { specifier: '-i, --id <id>', description:'Template ID'},
  ],
  async action(options) {
    const { client } = options
    let templateID = options.id
    if (!templateID) {
      const templates = await client.templates.index()
      if (templates.length === 0) {
        if (!options.silent) {
          console.error('Your account has no templates')
        }
        process.exit(1)
      }
      const answers = await inquirer.prompt([
        {
          type: 'list',
          message: 'Which template are you trying to render?',
          name: 'templateID',
          choices: templates.map(t => ({
            name: `${t.id}: ${t.title}`,
            value: t.id
          }))
        }
      ])

      templateID = answers.templateID
    }

    const html = await client.templates.render(templateID, {
      query: {
        debug: options.debug,
      },
    })

    if (!options.silent) {
      console.log(html)
    }

    if (options.open) {
      const $ = cheerio.load(html)
      $('title').prepend('&lt;render test&gt;: ')
      if (options.autoclose) {
        const seconds = typeof options.autoclose === 'boolean' ? 5 : parseInt(options.autoclose, 10)
        $('html').append(`
          <script>
            let left = ${seconds};
            const interval = setInterval(() => {
              if (--left === 0) {
                window.close();
              } else {
                document.getElementById('msg').innerHTML = 'autoclosing in ' + left + ' seconds (press space to cancel)'
              }
            }, 1000)

            document.addEventListener('keydown', e => {
              if (e.keyCode === 32) {
                clearInterval(interval)
                document.getElementById('msg').innerHTML = ''
              }
            })
          </script>
        `)

        $('body').append(`
          <div id="msg">autoclosing in ${seconds} seconds (press space to cancel)</div>
        `)
      }
      const command = `tmp=$(mktemp).html; echo ${shellescape([$.html()])} > $tmp; google-chrome "$tmp"; ${
        options.verbose ? 'echo "Temp file: $tmp";' : ''
      }`
      cp.exec(command)
      if (options.verbose) {
        console.log(colors.green('Running command:'), command)
      }
    }
  },
})

program.parse(process.argv)
