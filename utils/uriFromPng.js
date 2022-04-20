var fs = require('fs')

module.exports = file => {
  var bitmap = fs.readFileSync(file)
  const base64PNGString = new Buffer.from(bitmap, 'base64').toString('base64')

  return 'data:image/png;base64, ' + base64PNGString
}
