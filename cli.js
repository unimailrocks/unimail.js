#!/usr/bin/env node

const program = require('commander')
const Table = require('cli-table2')
require('colors') // is prototype hacking back in style yet?
const unimail = require('./index')
const package = require('./package.json')

const client = unimail.createClient()

program
  .version(package.version)

program
  .command('templates')
  .description('List all unimail templates')
  .action(async () => {
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

program.parse(process.argv)
