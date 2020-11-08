# Nativefier

# Development Guide

## Setup

First, clone the project

```bash
git clone https://github.com/Persiasty/nativefier.git
cd nativefier
```

Install dependencies for both the CLI and the Electron app:

```bash
# Under Windows:
npm run dev-up-win
```

Build nativefier:

```bash
npm run build
```

Set up a symbolic link so that running `nativefier` calls your dev version with your changes:

```bash
npm link
```

After doing so, you can rebuild and run Nativefier:

simply  `assemble.bat`

**Read the [API documentation](docs/api.md) or run `nativefier --help`**
to learn about other command-line flags usable to configure the packaged app.

To have high-resolution icons used by default for an app/domain, please
contribute to the [icon repository](https://github.com/jiahaog/nativefier-icons)!

## Development

Help welcome on [bugs](https://github.com/jiahaog/nativefier/issues?q=is%3Aopen+is%3Aissue+label%3Abug) and
[feature requests](https://github.com/jiahaog/nativefier/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request).

[Developer / build docs](docs/development.md), [API documentation](docs/api.md), 
[Changelog](CHANGELOG.md).

## License

[MIT](LICENSE.md)
