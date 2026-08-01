import type { Config } from "tailwindcss"

const config: Config = {
    content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
    theme: {
        extend: {
            colors: {
                accent: "#0C9482",
            },
        },
    },
    plugins: [],
}

export default config
