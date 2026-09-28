const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.env.TEST_SOURCE_ROOT || path.join(__dirname, '..');
for(const file of ['src/hooks/useExecutionControl.ts','src/components/SubmissionReplayModal.tsx']){
  test(`${file}: bodyless public GETs avoid a JSON Content-Type preflight and retain cancellation`,()=>{
    const ast=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let found=0;
    function visit(n){
      if(ts.isCallExpression(n)&&n.expression.getText(ast)==='fetch'){
        const opts=n.arguments[1];
        if(opts&&ts.isObjectLiteralExpression(opts)){
          const method=opts.properties.find(p=>p.name?.getText(ast)==='method');
          if(method&&ts.isPropertyAssignment(method)&&method.initializer.text==='GET'){
            found++;
            assert(!opts.properties.some(p=>p.name?.getText(ast)==='headers'),'unnecessary request header triggers OPTIONS');
            assert(opts.properties.some(p=>p.name?.getText(ast)==='signal'),'AbortSignal retained');
          }
        }
      }
      ts.forEachChild(n,visit);
    }
    visit(ast);assert.equal(found,1);
  });
}
test('submission POST retains JSON encoding and bearer authorization',()=>{
  const source=fs.readFileSync(path.join(root,'src/components/panel/RankingPanel.tsx'),'utf8');
  assert.match(source,/method: 'POST',\s*headers: \{\s*'Content-Type': 'application\/json',\s*Authorization: `Bearer \$\{user.accessToken\}`/);
});
