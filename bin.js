#! /usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const main = require('.');

function applyFile(inFile, outFile, configFile) {
  return main(
    path.resolve(inFile),
    JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf-8'))
  )
    .catch(error => {
      console.error(error);
    })
    .then(data => {
      fs.writeFileSync(path.resolve(outFile), data);
    });
}

function applyFolder(folderName) {
  const config = path.join(folderName, 'config.json');
  return Promise.all(fs.readdirSync(path.resolve(folderName))
    .filter(p => path.extname(p) === '.csv' || path.extname(p) === '.xml')
    .map(p => applyFile(
      path.join(folderName, p),
      path.join(folderName, path.extname(p) === '.csv'
        ? `${path.basename(p, '.csv')}.xml`
        : `${path.basename(p, '.xml')}.csv`),
      config
    )));
}

switch (process.argv.length) {
case 2:
  applyFolder('.');
  break;
case 3:
  applyFolder(process.argv[2]);
  break;
case 5:
  applyFile(process.argv[2], process.argv[4], process.argv[3]);
  break;
default: throw new Error('Unknown args');
}
