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
    entry: {
        frontend: './src/frontend/frontend.tsx',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'verbal-web-[name].js',
    },
    module: {
        rules: [
            // Typescript code
            {
                test: /src\/frontend\/.*\.tsx?$/,
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
                test: /dist\/verbal-web-frontend\.js$/,
                exclude: /node_modules/,
                use: 'source-map-loader',
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts'],
    },
};
