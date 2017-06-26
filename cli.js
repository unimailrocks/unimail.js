#!/usr/bin/env node

const program = require('commander')
const Table = require('cli-table2')
const inquirer = require('inquirer')
const fs = require('fs')
const cp = require('child_process')
const shellescape = require('shell-escape')
const cheerio = require('cheerio')
require('colors') // is prototype hacking back in style yet?
const unimail = require('./index')
const package = require('./package.json')

program
  .version(package.version)

program
  .command('templates')
  .description('List all unimail templates')
  .option('-v, --verbose', 'Verbose')
  .action(async options => {
    const client = unimail.createClient({
      verbose: options.verbose,
      color: true
    })
    const templates = await client.templates.index()
    const table = new Table({
      style: { 'padding-left': 2, 'padding-right': 2 },
    })

    const header =
      [
        { hAlign: 'center', content: '#' },
        { hAlign: 'center', content: 'ID'.blue.bold },
        { hAlign: 'center', content: 'Title'.blue.bold }
      ]

    const title = [{ hAlign: 'center', content: 'unimail templates'.bold + ` (${templates.length}) `.green, colSpan: header.length }]

    table.push(title)
    table.push(header)

    const foregrounds = ['white', 'grey']
    templates.forEach((t, i) => {
      const index = i % 2
      const fg = foregrounds[index]
      const colored = s => s[fg]
      table.push({
        [i + 1]: [
          colored(t.id), colored(t.title)
        ]
      })
    })

    console.log()
    console.log(table.toString().replace(/(^|\n)/g, '$1\t'))
    console.log()
  })

program
  .command('render')
  .description('Render an email template to HTML')
  .option('-v, --verbose', 'Verbose (debug information -- ignores "--silent" option)')
  .option('-o, --open', 'Open the HTML as a file')
  .option('-x, --autoclose [time]', 'Auto close the HTML after some number of seconds (defaults to 5)')
  // for unimail employees to test server development
  .option('-d, --debug <debug>', 'Ask the server to print debug information')
  .option('-s, --silent', 'Do not print normal output (does not cancel "--verbose" option)')
  .option('-n, --network', 'Show network requests')
  .option('-i, --id <id>', 'Template ID')
  .action(async (options) => {
    const client = unimail.createClient({
      verbose: options.verbose || options.network,
      color: true
    })
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
        console.log('Running command:'.green, command)
      }
    }
  })

program.parse(process.argv)
