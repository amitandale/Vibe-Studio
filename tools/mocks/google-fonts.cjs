const path = require("node:path");

const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const fontUrl = "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap";
const localFontPath = path.join(__dirname, "../assets/fonts/inter-latin-400.woff2");

const fontFaceBlock = (weight) => `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(${localFontPath}) format('woff2');
}`;

module.exports = {
  [fontUrl]: weights.map(fontFaceBlock).join("\n\n"),
};
