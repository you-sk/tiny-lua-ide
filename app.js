const codeEditorElement = document.getElementById('code-editor');
const outputArea = document.getElementById('output-area');
const runButton = document.getElementById('run-button');
const stopButton = document.getElementById('stop-button');
const importButton = document.getElementById('import-button');
const importFile = document.getElementById('import-file');
const exportButton = document.getElementById('export-button');
const resizeHandle = document.getElementById('resize-handle');
const editorPanel = document.getElementById('editor-panel');
const outputPanel = document.getElementById('output-panel');
const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeModalButton = document.getElementById('close-modal-button');
const closeModalButton2 = document.getElementById('close-modal-button-2');
const inputWrapper = document.getElementById('input-wrapper');
const userInput = document.getElementById('user-input');
const submitInput = document.getElementById('submit-input');

const editor = CodeMirror.fromTextArea(codeEditorElement, {
    mode: 'lua', theme: 'dracula', lineNumbers: true, lineWrapping: true,
    autofocus: true, autoRefresh: true,
});

const sampleCode = `-- 数当てゲーム
math.randomseed(os_time())
print("1から100までの数字を当ててみて！")

local secret_number = math.random(1, 100)
local attempts = 0

while true do
  attempts = attempts + 1
  print(attempts .. "回目の挑戦: ")
  
  local input = io_read()
  local guess = tonumber(input)

  if guess == nil then
    print("数字を入力してください。")
  elseif guess < secret_number then
    print("もっと大きい数字です。")
  elseif guess > secret_number then
    print("もっと小さい数字です。")
  else
    print("正解！ " .. attempts .. "回で当たりました。")
    break
  end
end`;
editor.setValue(sampleCode);
setTimeout(() => editor.refresh(), 100);

let luaThread = null;

const executeLuaCode = () => {
    if (luaThread) return;
    outputArea.textContent = '';
    outputArea.classList.remove('text-red-400');
    runButton.classList.add('hidden');
    stopButton.classList.remove('hidden');

    const luaCode = editor.getValue();
    if (!luaCode.trim()) {
        outputArea.textContent = 'コードが入力されていません。';
        handleCompletion();
        return;
    }

    try {
        const L = fengari.lauxlib.luaL_newstate();
        fengari.lualib.luaL_openlibs(L);
        
        const customPrint = (L) => {
            const n = fengari.lua.lua_gettop(L); let parts = [];
            fengari.lua.lua_getglobal(L, fengari.to_luastring("tostring"));
            for (let i = 1; i <= n; i++) {
                fengari.lua.lua_pushvalue(L, -1); fengari.lua.lua_pushvalue(L, i);
                fengari.lua.lua_call(L, 1, 1);
                const s = fengari.lua.lua_tostring(L, -1);
                parts.push(s ? fengari.to_jsstring(s) : "nil");
                fengari.lua.lua_pop(L, 1);
            }
            outputArea.textContent += parts.join('\t') + '\n';
            outputArea.scrollTop = outputArea.scrollHeight;
            return 0;
        };
        
        const customRead = (L) => {
            inputWrapper.classList.remove('hidden');
            userInput.focus();
            return fengari.lua.lua_yield(L, 0); 
        };

        const customOsTime = (L) => {
            fengari.lua.lua_pushinteger(L, Math.floor(Date.now() / 1000));
            return 1;
        };
        
        fengari.lua.lua_pushjsfunction(L, customPrint);
        fengari.lua.lua_setglobal(L, fengari.to_luastring("print"));
        fengari.lua.lua_pushjsfunction(L, customRead);
        fengari.lua.lua_setglobal(L, fengari.to_luastring("io_read"));
        fengari.lua.lua_pushjsfunction(L, customOsTime);
        fengari.lua.lua_setglobal(L, fengari.to_luastring("os_time"));

        luaThread = fengari.lua.lua_newthread(L);
        
        const status = fengari.lauxlib.luaL_loadstring(luaThread, fengari.to_luastring(luaCode));
        if (status !== fengari.lua.LUA_OK) {
            throw new Error(fengari.lua.lua_tojsstring(luaThread, -1));
        }
        resumeLua();

    } catch (error) {
        handleError(error);
    }
};

const resumeLua = (inputValue) => {
    if (!luaThread) return;
    const n_args = inputValue === undefined ? 0 : 1;
    if (n_args > 0) {
        fengari.lua.lua_pushstring(luaThread, fengari.to_luastring(inputValue));
    }
    const status = fengari.lua.lua_resume(luaThread, null, n_args);
    
    if (status === fengari.lua.LUA_OK) { handleCompletion(); }
    else if (status !== fengari.lua.LUA_YIELD) { 
        handleError(new Error(fengari.lua.lua_tojsstring(luaThread, -1))); 
    }
};

const handleError = (error) => {
    const displayMessage = (error && error.message) ? error.message : "不明な実行時エラーが発生しました";
    outputArea.textContent += `\nエラー: ${displayMessage}`;
    outputArea.classList.add('text-red-400');
    handleCompletion();
};

const handleCompletion = (interrupted = false) => {
    if (interrupted) {
        outputArea.textContent += '\n\n--- 実行が中断されました ---';
    }
    luaThread = null;
    inputWrapper.classList.add('hidden');
    userInput.value = '';
    runButton.classList.remove('hidden');
    stopButton.classList.add('hidden');
};

const submitUserInput = () => {
     if (!luaThread) return;
     const value = userInput.value;
     inputWrapper.classList.add('hidden');
     userInput.value = '';
     outputArea.textContent += value + '\n';
     resumeLua(value);
};

runButton.addEventListener('click', executeLuaCode);
stopButton.addEventListener('click', () => {
    if(luaThread) {
        handleCompletion(true);
    }
});
submitInput.addEventListener('click', submitUserInput);
userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitUserInput(); });

importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => editor.setValue(e.target.result);
    reader.readAsText(file);
    e.target.value = '';
});
exportButton.addEventListener('click', () => {
    const blob = new Blob([editor.getValue()], { type: 'application/lua' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'code.lua';
    a.click();
    URL.revokeObjectURL(a.href);
});

const openModal = () => helpModal.classList.remove('hidden');
const closeModal = () => helpModal.classList.add('hidden');
helpButton.addEventListener('click', openModal);
closeModalButton.addEventListener('click', closeModal);
closeModalButton2.addEventListener('click', closeModal);
helpModal.addEventListener('click', (e) => { if(e.target === helpModal) closeModal(); });

let isResizing = false;
resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const mainContent = document.getElementById('main-content');
    const totalWidth = mainContent.clientWidth;
    const mouseX = e.clientX - mainContent.getBoundingClientRect().left;
    
    const minWidth = 200; 
    let leftWidth = mouseX;

    if (leftWidth < minWidth) leftWidth = minWidth;
    if (leftWidth > totalWidth - minWidth - resizeHandle.offsetWidth) {
        leftWidth = totalWidth - minWidth - resizeHandle.offsetWidth;
    }

    editorPanel.style.width = `${leftWidth}px`;
});
document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        editor.refresh();
    }
});