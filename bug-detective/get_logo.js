const fs = require('fs');
const https = require('https');

https.get('https://www.cursor.com/favicon.ico', (res) => {
  let data = [];
  res.on('data', chunk => data.push(chunk));
  res.on('end', () => {
    fs.writeFileSync('favicon.ico', Buffer.concat(data));
    console.log('Saved favicon.ico');
  });
});
