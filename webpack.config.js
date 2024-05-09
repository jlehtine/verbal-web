const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const babelOptions = {
    presets: [
        [
            "@babel/preset-env",
            {
                useBuiltIns: "usage",
                corejs: "3.37",
            },
        ],
        "@babel/preset-react",
    ],
};

module.exports = [
    {
        mode: "production",
        entry: path.resolve(__dirname, "src", "frontend", "frontend.tsx"),
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "verbal-web-frontend.js",
        },
        module: {
            rules: [
                // Typescript code
                {
                    test: /\.tsx?$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "babel-loader",
                            options: babelOptions,
                        },
                        {
                            loader: "ts-loader",
                        },
                    ],
                },

                // Source map loader for output files
                {
                    test: path.resolve(__dirname, "dist", "verbal-web-frontend.js"),
                    exclude: /node_modules/,
                    use: "source-map-loader",
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts", "..."],
        },
        plugins: [new ESLintPlugin()],
    },
    {
        mode: "production",
        target: "node",
        entry: path.resolve(__dirname, "src", "backend", "backend.ts"),
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "verbal-web-backend.js",
        },
        module: {
            rules: [
                // Typescript code
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "ts-loader",
                        },
                    ],
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts", "..."],
        },
        plugins: [
            new ESLintPlugin(),
            new CopyWebpackPlugin({
                patterns: [{ from: path.resolve(__dirname, "static"), to: path.resolve(__dirname, "dist") }],
            }),
        ],
    },
];
