
/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. You must pass the config via the API.
 * However, the CLI commands will read this file.
 */
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

Config.overrideWebpackConfig((currentConfiguration) => {
    return {
        ...currentConfiguration,
        module: {
            ...currentConfiguration.module,
            rules: [
                ...(currentConfiguration.module?.rules
                    ? currentConfiguration.module.rules.filter((rule) => {
                        if (rule === "..." || typeof rule !== "object") return true;
                        // @ts-ignore
                        return rule.test?.toString() !== "/\\.css$/i";
                    })
                    : []),
                {
                    test: /\.css$/i,
                    use: [
                        "style-loader",
                        "css-loader",
                        {
                            loader: "postcss-loader",
                            options: {
                                postcssOptions: {
                                    plugins: [
                                        "tailwindcss",
                                        "autoprefixer",
                                    ],
                                },
                            },
                        },
                    ],
                },
            ],
        },
    };
});
