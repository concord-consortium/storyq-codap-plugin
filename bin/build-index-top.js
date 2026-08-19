/**
 * Writes build/index-top.html: the copy of index.html whose asset paths resolve when it is served
 * from the top of the S3 prefix rather than from its own version folder. The release workflow copies
 * that file over the top level index.html, so a version folder without one fails the release at the
 * copy step rather than at build time.
 *
 * Repos with a hand written webpack config get this from a second HtmlWebpackPlugin configured with
 * publicPath: process.env.DEPLOY_PATH. react-scripts owns its webpack config and emits a single
 * index.html, so the same rewrite happens here instead.
 *
 * s3-deploy-action sets DEPLOY_PATH when it builds, to version/<tag> or branch/<name>. A local build
 * has neither the variable nor a top level to be served from, so it writes nothing.
 */
const fs = require("fs");
const path = require("path");

const kBuildDir = path.resolve(__dirname, "..", "build");
const kSource = path.join(kBuildDir, "index.html");
const kDestination = path.join(kBuildDir, "index-top.html");

const tDeployPath = process.env.DEPLOY_PATH;
if (!tDeployPath) {
  console.log("build-index-top: no DEPLOY_PATH, so this build needs no index-top.html");
  process.exit(0);
}

const tPrefix = tDeployPath.replace(/\/+$/, "");
const tSourceHtml = fs.readFileSync(kSource, "utf8");
// Document relative because package.json sets homepage to ".", which is what makes index.html usable
// inside its own version folder and useless anywhere else
const tTopHtml = tSourceHtml.replace(/(src|href)="\.\//g, `$1="${tPrefix}/`);
if (tTopHtml === tSourceHtml) {
  // The rewrite depends on homepage being ".". Remove it or set it to an absolute URL and
  // react-scripts emits "/static/..." instead, leaving nothing here to rewrite. Fail the build
  // rather than upload a file whose every path silently resolves to the wrong folder.
  throw new Error(`build-index-top: found no "./" asset paths in ${kSource}`);
}

fs.writeFileSync(kDestination, tTopHtml);
console.log(`build-index-top: wrote index-top.html with asset paths under ${tPrefix}/`);
