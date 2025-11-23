const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const projectRoot = path.resolve(__dirname, '..');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  staticDir: path.resolve(projectRoot, 'src')
};
