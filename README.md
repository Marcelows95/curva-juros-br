# Curva de Juros BR

Dashboard de curvas de juros brasileiras em tempo real.

## Fontes
| Dado | Fonte | Auth |
|---|---|---|
| Nominal (Pré) | Tesouro Direto (Prefixado + NTN-F) | Nenhuma |
| Real (IPCA+) | Tesouro Direto (NTN-B) | Nenhuma |
| Inflação Implícita | Fisher calculado localmente | — |
| IPCA Focus | BCB Olinda API | Nenhuma |

## Dev local
```bash
npm install
npm run dev
```

## Deploy
Conecte este repositório no Vercel. Build automático a cada push.

## Cache
A API route cacheia os dados por 1 hora no edge da Vercel (`s-maxage=3600`).
