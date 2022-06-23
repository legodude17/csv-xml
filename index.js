const { parse: parseCSV } = require('csv');
// eslint-disable-next-line import/no-unresolved
const { stringify: stringifyCSV } = require('csv/sync');
const fs = require('fs');
const path = require('path');
const convert = require('xml-js');

function formatWithOptions(data, options) {
  if (options == null) return data;
  if (options.removeWhitespace) data = data.replace(/\s/g, '');
  if (options.prefix != null) data = options.prefix + data;
  if (options.remove != null) {
    if (typeof options.remove === 'string') {
      data = data.replaceAll(options.remove, '');
    } else if (Array.isArray(options.remove)) {
      options.remove.forEach(remove => { data = data.replaceAll(remove, ''); });
    }
  }
  if (options.replace != null) {
    for (const replace of Object.keys(options.replace)) {
      data = data.replaceAll(replace, options.replace[replace]);
    }
  }
  return data;
}

function findElm(elm, name) {
  return elm.elements.filter(e => e.name === name)[0];
}

module.exports = async function main(input, config) {
  if (path.extname(input) === '.csv') {
    const obj = {
      _declaration: {
        _attributes: config.declaration || {
          version: '1.0',
          encoding: 'utf-8'
        }
      },
      elements: []
    };
    let arr = obj.elements;
    function apply(elm, data, record) {
      if (Array.isArray(data)) {
        data.forEach(d => apply(elm, d, record));
        return;
      }
      if (data.options != null && data.options.omitIfMissing && record === '') return;
      if (data.path != null) {
        if (!Array.isArray(data.path)) data.path = data.path.replace(/\s/g, '').split(',');
        for (const part of data.path) {
          let newElm = findElm(elm, part);
          if (newElm == null) {
            newElm = {
              type: 'element',
              name: part,
              elements: []
            };
            elm.elements.push(newElm);
          }
          elm = newElm;
        }
      }
      switch (data.type) {
      case 'element':
        elm.elements.push({
          type: 'element',
          name: data.elementName,
          elements: [{ type: 'text', text: formatWithOptions(record, data.options) }]
        });
        break;
      case 'list': {
        const newElm = {
          type: 'element',
          name: data.elementName,
          elements: []
        };
        for (const item of record.split(data.delimiter || ',')) {
          newElm.elements.push({
            type: 'element',
            name: data.listElementName || 'li',
            elements: [{ type: 'text', text: formatWithOptions(item, data.options) }]
          });
        }
        elm.elements.push(newElm);
        break;
      }
      case 'add': {
        let addTo = findElm(elm, data.elementName);
        if (addTo == null) {
          addTo = {
            type: 'element',
            name: data.elementName,
            elements: []
          };
          elm.elements.push(addTo);
        }
        for (const inner of data.add) {
          apply(addTo, inner, record);
        }
        break;
      }
      case 'comment':
        elm.elements.push({
          type: 'comment',
          comment: record
        });
        break;
      default: throw new Error(`Unrecognized type: ${data.type}`);
      }
    }
    if (config.baseElement != null) {
      obj.elements.push({
        type: 'element',
        name: config.baseElement,
        elements: []
      });
      arr = obj.elements[0].elements;
    }
    let toIgnore = config.ignoreStart || 0;
    for await (const record of fs.createReadStream(input).pipe(parseCSV())) {
      if (toIgnore > 0) { toIgnore--; } else {
        const elm = {
          type: 'element',
          name: config.elementName,
          elements: []
        };
        for (let i = 0; i < config.data.length; i++) {
          apply(elm, config.data[i], record[i]);
        }
        arr.push(elm);
      }
    }
    return convert.js2xml(obj, {
      spaces: 2
    });
  }
  if (path.extname(input) === '.xml') {
    let obj = convert.xml2js(await fs.promises.readFile(input), {
      alwaysChildren: true
    });
    if (config.baseElement != null) {
      obj = findElm(obj, config.baseElement);
    }
    function retrieve(elm, data) {
      while (Array.isArray(data)) [data] = data;
      if (data.path != null) {
        if (!Array.isArray(data.path)) data.path = data.path.replace(/\s/g, '').split(',');
        for (const part of data.path) {
          elm = findElm(elm, part);
          if (elm == null) return '';
        }
      }
      switch (data.type) {
      case 'element': {
        const found = findElm(elm, data.elementName);
        if (found == null) return '';
        return found.elements[0].text;
      }
      case 'list':
        return elm.elements
          .filter(e => e.name === (data.listElementName || 'li'))
          .map(e => e.elements[0].text)
          .join(data.delimiter || ',');
      case 'add': {
        const addTo = findElm(elm, data.elementName);
        if (addTo == null) return '';
        return retrieve(addTo, data.add);
      }
      case 'comment': {
        const comment = elm.elements.filter(e => e.type === 'comment')[0];
        if (comment == null) return '';
        return comment.comment;
      }
      default: throw new Error(`Unrecognized type: ${data.type}`);
      }
    }
    return stringifyCSV(obj.elements
      .filter(e => e.name === config.elementName)
      .map(e => config.data.map(d => retrieve(e, d))));
  }
  throw new Error(`Don't know what to do with: ${input}`);
};
