#!/usr/bin/env node

const program = require('commander')
const Table = require('cli-table2')
const inquirer = require('inquirer')
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
  .command('render [<id>]')
  .description('Render an email template to HTML')
  .option('-v, --verbose', 'Verbose')
  .action(async (id, options) => {
    const client = unimail.createClient({
      verbose: options.verbose,
      color: true
    })
    let templateID = id
    if (!templateID) {
      const templates = await client.templates.index()
      if (templates.length === 0) {
        console.error('Your account has no templates')
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

    const html = await client.templates.render(templateID)
    console.log(html)
  })

program.parse(process.argv)
