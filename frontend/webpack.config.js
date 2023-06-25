const path = require('path');

const babelOptions = {
    presets: [
        [
            '@babel/preset-env',
            {
                useBuiltIns: 'usage',
                corejs: '3.31',
            },
        ],
        '@babel/preset-react',
    ],
};

module.exports = {
    mode: 'production',
    entry: './src/main.tsx',
    output: {
        filename: 'verbal-web.js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            // Typescript code
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: babelOptions,
                    },
                    {
                        loader: 'ts-loader',
                    },
                ],
            },

            // Source map loader for output files
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: 'source-map-loader',
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts'],
    },
};
