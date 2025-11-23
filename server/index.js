const express = require('express');
const path = require('path');
const { port, staticDir } = require('./config');

const app = express();

app.use(express.static(staticDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`kaliDict server listening on port ${port}`);
});
