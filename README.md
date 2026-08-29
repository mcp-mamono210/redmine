## Phase 31-2 compatibility fix

### 原因

`connectE2eClient()` を `tests/e2e/helpers.ts` から削除した時点で、
以下の既存 E2E がまだ import していた。

```text
issues.test.ts
projects.test.ts
read-only-contract.test.ts
read-only-workflow.test.ts
search.test.ts
structured-output.test.ts
```

このため TypeScript の import 解決が失敗し、その結果 ESLint の type-aware rule が
`client`, `callTool()`, `listTools()` の型を `error typed` として扱い、
305件の二次エラーが発生した。

### 修正

`connectE2eClient()` を compatibility wrapper として復元する。

内部では Phase 31-1 の `createMcpE2eHarness()` を利用するため、
Server / transport lifecycle の実装は重複させない。

戻り値は明示的に以下とする。

```ts
export interface E2eClientContext {
  client: Client;
  redmineApiKey: string;
}
```

これにより既存 E2E の `client.listTools()` / `client.callTool()` の型解決を維持する。

### 重要

これは Harness を撤回する修正ではない。

```text
既存 test
  ↓
connectE2eClient() compatibility wrapper
  ↓
createMcpE2eHarness()
  ↓
Client / stdio transport
```

残存6ファイルを Harness API へ移行した後で、
`connectE2eClient()` を削除すればよい。

### 確認

```text
npm run lint
npm run typecheck
npm run test:e2e
```
