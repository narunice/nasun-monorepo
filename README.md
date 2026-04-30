# Nasun

Nasun is a protocol that turns repeated onchain behavior into a persistent, compounding asset across applications. Built around a retention engine validated through modules like Pado (DeFi) and GoStop (gaming), it captures and unifies the economic value of user activity at the network level.

## Products

| App                                        | Description                                                                    | Status |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ------ |
| [Nasun Website / Uju](apps/nasun-website/) | Ecosystem dashboard: ecosystem points, governance, NFT management, leaderboard | Live   |
| [Pado](apps/pado/)                         | DEX, prediction markets, lottery, mini-games                                   | Live   |
| [GoStop](apps/gostop/)                     | Onchain gaming hub                                                             | Live   |
| [Network Explorer](apps/network-explorer/) | Block explorer + ecosystem API server                                          | Live   |
| [Baram](apps/baram/)                       | AI compliance settlement layer                                                 | Active |

## Links

- [nasun.io](https://nasun.io) — official website
- [explorer.nasun.io](https://explorer.nasun.io/devnet) - network explorer website
- [pado.nasun.io](https://pado.nasun.io) — Pado app
- [gostop.app](https://gostop.app) — GoStop gaming hub
- [@nasun_io](https://x.com/nasun_io) — Nasun official X
- [Nasun Telegram](https://t.me/nasun_io) — official Telegram channel
- [@narunice](https://x.com/narunice) — founder
- [@0verclock](https://x.com/0verclock) — team

## Network

| Spec         | Value        |
| ------------ | ------------ |
| Network      | Nasun Devnet |
| Chain ID     | `272218f1`   |
| Native Token | NASUN        |

## Structure

```
nasun-monorepo/
├── apps/
│   ├── nasun-website/         # Uju ecosystem platform (frontend/ + cdk/ + chat-server/)
│   ├── pado/                  # DeFi + prediction + lottery + mini-games
│   ├── gostop/                # Onchain gaming hub
│   ├── network-explorer/      # Block explorer (frontend + api-server/)
│   └── baram/                 # AI settlement layer
├── packages/
│   ├── wallet/                # @nasun/wallet
│   ├── wallet-ui/             # @nasun/wallet-ui
│   ├── devnet-config/         # contract addresses
│   └── tailwind-config/       # brand design tokens
└── docs/                      # infrastructure + deployment docs
```

## License

Business Source License 1.1 - see [LICENSE](LICENSE).  
Non-commercial use permitted. Converts to Apache 2.0 on 2029-01-01.  
Commercial licensing: hello@nasun.io
