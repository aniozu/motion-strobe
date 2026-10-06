# Motion Strobe

A free browser-based tool for creating strobe photos and videos, tracking objects, and analyzing motion with graphs and curve fitting.

## GitHub Pagesで公開

1. このZIPを解凍します。ZIPそのものではなく、フォルダ内のファイルを登録してください。
2. GitHubでPublicのリポジトリを作成します。既定のブランチはmainにします。
3. GitHub Desktopでリポジトリをクローンし、このフォルダの中身をすべてコピーします。.githubフォルダも必要です。
4. GitHub DesktopでCommit to main → Push originを実行します。
5. GitHubのリポジトリでSettings → Pages → Build and deployment → SourceをGitHub Actionsにします。
6. Actions → Publish Motion Strobe → Run workflowで公開します。成功したらSettings → Pagesに公開URLが表示されます。

日本語ページは公開URL、英語ページはその末尾にen/を付けたURLです。
ユーザーサイト（ユーザー名.github.io）とプロジェクトサイト（ユーザー名.github.io/リポジトリ名/）の両方に対応します。
GitHub Pagesの設定から取得したURLでリンク・検索メタデータ・サイトマップを自動生成します。

### ファイルの位置

リポジトリ直下にpackage.json、build.mjs、src、dist、scripts、translations、test、.githubを置きます。
Motion-Strobe-GitHub-Pagesという親フォルダごと登録しないでください。
ブラウザからのアップロードで.githubが抜ける場合はGitHub Desktopを使ってください。

### 更新

コードを編集しmainへPushすると、テスト・ビルド・公開が自動実行されます。
画面の日本語HTMLとCSSはdist/index.htmlとdist/style.css、処理はsrc、英訳はtranslationsにあります。

### ローカル確認

Node.js 22をインストール後、このフォルダで実行:

```
npm ci
npm test
npm run build
npm start
```

公開URLを指定してビルドする場合:

```
SITE_URL=https://USERNAME.github.io/REPOSITORY/ npm run build
```

### Google検索

公開後、新しいURLをSearch Consoleに登録しsitemap.xmlを送信します。
以前のサイト用の確認ファイルは含めていません。新しいプロパティの確認ファイルをdistへ入れてPushしてください。

動画処理はブラウザ内で実行します。処理にChatGPTの契約やOpenAI APIキーは不要です。
第三者ライブラリのライセンス表記はdist/THIRD_PARTY_LICENSES.txtを参照してください。

Source snapshot: Motion Strobe 1.15.5, GitHub Pages migration package.
