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
      head: [{ hAlign: 'center', content: 'ID'.blue.bold }, { hAlign: 'center', content: 'Title'.blue.bold }],
      style: { 'padding-left': 2, 'padding-right': 2 },
    })

    const foregrounds = ['grey', 'white']
    const backgrounds = ['bgBlack', 'bgWhite']
    templates.forEach((t, i) => {
      const index = i % 2
      const bg = backgrounds[index]
      const fg = foregrounds[index]
      const colored = s => s[fg]
      table.push([
        colored(t.id), colored(t.title)
      ])
    })

    console.log(table.toString())
  })

program.parse(process.argv)
