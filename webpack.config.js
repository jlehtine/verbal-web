const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const nodeExternals = require("webpack-node-externals");

const COREJS_VERSION = "3.37";
const NODE_VERSION = "20";

const babelOptions = {
    presets: [
        [
            "@babel/preset-env",
            {
                useBuiltIns: "usage",
                corejs: COREJS_VERSION,
            },
        ],
        "@babel/preset-react",
    ],
};

const babelOptionsBackend = {
    presets: [
        [
            "@babel/preset-env",
            {
                useBuiltIns: "usage",
                corejs: COREJS_VERSION,
                targets: {
                    node: NODE_VERSION,
                },
            },
        ],
        "@babel/preset-react",
    ],
};

module.exports = [
    {
        mode: "production",
        entry: {
            frontend: path.resolve(__dirname, "src", "frontend", "frontend.tsx"),
        },
        output: {
            path: path.resolve(__dirname, "dist", "assets"),
            filename: "[name].js",
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

                // CSS styles
                {
                    test: /\.css$/,
                    use: ["css-loader"],
                },

                // Source map loader for output files
                {
                    test: /dist[/\\]*.js$/,
                    exclude: /node_modules/,
                    use: "source-map-loader",
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts", "..."],
        },
        devServer: {
            proxy: [
                {
                    static: false,
                    context: ["/"],
                    target: "http://localhost:3000",
                },
                {
                    static: false,
                    context: ["/chatws"],
                    target: "http://localhost:3000",
                    ws: true,
                },
            ],
            open: true,
            port: 9000,
        },
        plugins: [new ESLintPlugin()],
    },
    {
        mode: "production",
        target: "node",
        externals: [nodeExternals()],
        entry: {
            backend: path.resolve(__dirname, "src", "backend", "backend.ts"),
        },
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "[name].js",
        },
        module: {
            rules: [
                // Typescript code
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "babel-loader",
                            options: babelOptionsBackend,
                        },
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
        plugins: [new ESLintPlugin()],
    },
];
