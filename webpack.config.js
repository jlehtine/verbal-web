const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const nodeExternals = require("webpack-node-externals");

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
                    test: /src[/\\](frontend|shared)[/\\].*\.tsx?$/,
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
                    test: /dist[/\\]frontend[/\\]*.js$/,
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
                    context: ["/vw/chat"],
                    target: "http://localhost:3000",
                    ws: true,
                },
            ],
            port: 9000,
        },
        plugins: [new ESLintPlugin()],
    },
    {
        mode: "production",
        entry: {
            G711AEncoder: path.resolve(__dirname, "src", "audioworklet", "G711AEncoder.ts"),
            PCM16SLEDecoder: path.resolve(__dirname, "src", "audioworklet", "PCM16SLEDecoder.ts"),
        },
        output: {
            path: path.resolve(__dirname, "dist", "assets"),
            filename: "[name].js",
        },
        module: {
            rules: [
                // Typescript code
                {
                    test: /src[/\\]audioworklet[/\\].*\.tsx?$/,
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
            ],
        },
        resolve: {
            extensions: [".ts", "..."],
        },
        devServer: false,
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
                    test: /src[/\\](backend|shared)[/\\].*\.ts$/,
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
        plugins: [new ESLintPlugin()],
    },
];
