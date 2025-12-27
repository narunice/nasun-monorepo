# React Starter Template

This app was created using `create-eincode-app` that sets up a basic React
app using the following tools:

- [React](https://react.dev/) as the UI framework
- [TypeScript](https://www.typescriptlang.org/) for type checking
- [Vite](https://vitejs.dev/) for build tooling
- [Tailwind](https://tailwindcss.com/) for css
- [ESLint](https://eslint.org/)
- [pnpm](https://pnpm.io/) for package management

## Environment Variables

Before running the application, you need to set up your environment variables. Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

Make sure to populate the `.env` file with the correct values for your environment.

## Starting your dApp

To install dependencies you can run

```bash
pnpm install
```

To start your dApp in development mode run

```bash
pnpm dev
```

## Building

To build your app for deployment you can run

```bash
pnpm build
```
