const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'yuan-monitor-sdk.js',
    library: {
      name: 'YuanMonitor',
      type: 'umd'
    },
    globalObject: 'this',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['> 1%', 'last 2 versions', 'not dead']
                },
                useBuiltIns: false
              }]
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  externals: {
    // rrweb 由使用者提供，不打包进 SDK
    rrweb: {
      commonjs: 'rrweb',
      commonjs2: 'rrweb',
      amd: 'rrweb',
      root: 'rrweb'
    },
    // react 由使用者提供，不打包进 SDK
    react: {
      commonjs: 'react',
      commonjs2: 'react',
      amd: 'react',
      root: 'React'
    }
  },
  devtool: 'source-map',
  optimization: {
    minimize: true
  }
};
