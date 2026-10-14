# Bundled typefaces

Variable TrueType fonts from the official Google Fonts repository:

- Noto Sans Thai: https://github.com/google/fonts/tree/main/ofl/notosansthai
- Anuphan: https://github.com/google/fonts/tree/main/ofl/anuphan

Each font is distributed under the accompanying SIL Open Font License.
RootLayout loads them with next/font/local so production builds do not fetch
or parse Google Fonts CSS. Material Symbols remains a runtime stylesheet.
