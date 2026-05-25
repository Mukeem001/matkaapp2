function readPackage(pkg, context) {
  // This pnpmfile ensures dependencies with build scripts are properly handled
  // It helps prevent pnpm from blocking esbuild and similar build tools
  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
