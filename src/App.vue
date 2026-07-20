<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { db } from './firebase';
import { ref as dbRef, onValue, set, update, push, onDisconnect, serverTimestamp, get } from 'firebase/database';

// Tauri v2 用の通知API
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

type Status = '出席' | '欠席' | '外出';

const isRegistered = ref(false);
const myId = ref('');
const myName = ref('');
const myLabId = ref('lab6');
const myColor = ref('#00f0ff'); 
const myStatus = ref<Status>('出席');

const labs = ref<any>({});
const chatMessages = ref<any[]>([]);
const chatMessagesRef = ref<HTMLElement | null>(null);
const nowTime = ref(Date.now());
const ONE_HOUR = 3600000;

// ⚙️ 設定モーダルの開閉状態
const showSettingsModal = ref(false);

// 🎨 テーマ管理
const currentTheme = ref(localStorage.getItem('appTheme') || 'cyber');
const changeTheme = (themeName: string) => {
  currentTheme.value = themeName;
  localStorage.setItem('appTheme', themeName);
};

// 🔔 各通知のON/OFF設定（ローカルストレージ保存）
const notifyChat = ref(localStorage.getItem('notifyChat') !== 'false');
const notifyStatus = ref(localStorage.getItem('notifyStatus') !== 'false');
const notifyReaction = ref(localStorage.getItem('notifyReaction') !== 'false');

watch(notifyChat, (val) => localStorage.setItem('notifyChat', String(val)));
watch(notifyStatus, (val) => localStorage.setItem('notifyStatus', String(val)));
watch(notifyReaction, (val) => localStorage.setItem('notifyReaction', String(val)));

const isExpired = (timestamp: any) => {
  if (!timestamp) return false;
  return (nowTime.value - timestamp) > ONE_HOUR;
};

const getLabName = (id: string) => {
  const names: Record<string, string> = {
    lab1: '第1研究室', lab2: '第2研究室', lab3: '第3研究室',
    lab4: '第4研究室', lab5: '第5研究室', lab6: '第6研究室',
    lab7: '第7研究室', lab8: '第8研究室', lab9: '第9研究室'
  };
  return names[id] || '研究室';
};

// 👥 IDからユーザー名を逆引きするヘルパー
const findMemberName = (userId: string): string => {
  for (const labId of Object.keys(labs.value || {})) {
    const member = labs.value[labId]?.members?.[userId];
    if (member) return member.name;
  }
  return 'ゲスト';
};

// 👍 リアクション情報（個数とリアクションした人の一覧文）を取得
const getReactionInfo = (reactions: any, type: 'good' | 'bad') => {
  if (!reactions) return { count: 0, names: '' };
  const userIds = Object.keys(reactions).filter(id => reactions[id] === type);
  const names = userIds.map(id => findMemberName(id)).join(', ');
  return {
    count: userIds.length,
    names: names ? `${names} がリアクションしました` : ''
  };
};

onMounted(() => {
  // 1. 何よりも先にストレージをチェック
  const savedId = localStorage.getItem('myId');
  const savedName = localStorage.getItem('myName');
  const savedLab = localStorage.getItem('myLabId');
  const savedColor = localStorage.getItem('myColor');

  if (savedColor) myColor.value = savedColor;

  // 2. 登録情報があれば、何があろうと「即座に」メイン画面にして通信をスタートさせる！
  if (savedId && savedName && savedLab) {
    myId.value = savedId;
    myName.value = savedName;
    myLabId.value = savedLab;
    isRegistered.value = true;
    
    startApp(); // ⚡【超重要】ここを await の手前に持ってきて即実行！
  }

  // 3. タイマー始動
  setInterval(() => { nowTime.value = Date.now(); }, 60000);

  // 4. 【ノンブロッキング化】通知許可は、アプリの起動を邪魔しないように裏でゆっくりやる
  isPermissionGranted().then(async (hasPermission) => {
    if (!hasPermission) {
      await requestPermission();
    }
  }).catch(err => console.error("Notification setup error:", err));

  // 5. 【ノンブロッキング化】Firebaseの初期化チェックも裏で実行（エラーになっても全体を巻き込まない）
  get(dbRef(db, 'labs')).then((snapshot) => {
    if (!snapshot.exists()) {
      initializeDatabase();
    }
  }).catch(err => console.error("Firebase connection error:", err));
});

const initializeDatabase = async () => {
  await set(dbRef(db, 'labs'), {
    lab1: { members: {} }, lab2: { members: {} }, lab3: { members: {} },
    lab4: { members: {} }, lab5: { members: {} }, lab6: { members: {} },
    lab7: { members: {} }, lab8: { members: {} }, lab9: { members: {} }
  });
};

const registerUser = () => {
  if (!myName.value.trim()) return;
  myId.value = 'user_' + Date.now();
  localStorage.setItem('myId', myId.value);
  localStorage.setItem('myName', myName.value);
  localStorage.setItem('myLabId', myLabId.value);
  localStorage.setItem('myColor', myColor.value);
  isRegistered.value = true;
  startApp();
};

const sendSystemMessage = (actionText: string) => {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  push(dbRef(db, 'chats'), {
    sender: 'SYSTEM',
    text: actionText,
    time: timeStr,
    timestamp: serverTimestamp()
  });
};

const formatElapsedTime = (timestamp: number) => {
  if (!timestamp) return '更新日時不明';
  const diffMs = nowTime.value - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  return `${Math.floor(diffHour / 24)}日前`;
};

let isFirstLoad = true;
let isFirstLabLoad = true;

const startApp = () => {
  const labsRef = dbRef(db, 'labs');
  const myMemberRef = dbRef(db, `labs/${myLabId.value}/members/${myId.value}`);
  const chatRef = dbRef(db, 'chats');

  onValue(labsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // 自動クリア
      Object.keys(data).forEach(labId => {
        Object.keys(data[labId].members || {}).forEach(mId => {
          if (data[labId].members[mId].action && isExpired(data[labId].members[mId].actionAt)) {
            update(dbRef(db, `labs/${labId}/members/${mId}`), { action: '', actionAt: null, reactions: null });
          }
        });
      });

      if (!isFirstLabLoad) {
        // 🔔 1. ステータス変更の通知
        if (notifyStatus.value) {
          Object.keys(data).forEach(labId => {
            Object.keys(data[labId].members || {}).forEach(mId => {
              if (mId !== myId.value) { 
                const oldAction = labs.value?.[labId]?.members?.[mId]?.action || '';
                const newAction = data[labId].members[mId]?.action || '';
                const memberName = data[labId].members[mId]?.name || 'メンバー';

                if (newAction && oldAction !== newAction) {
                  sendNotification({
                    title: `📌 ${memberName} (${getLabName(labId)})`,
                    body: `ステータス変更: 「${newAction}」`
                  });
                }
              }
            });
          });
        }

        // 🔔 2. あなたへのリアクション通知
        if (notifyReaction.value) {
          const oldMyReactions = labs.value?.[myLabId.value]?.members?.[myId.value]?.reactions || {};
          const newMyReactions = data[myLabId.value]?.members?.[myId.value]?.reactions || {};

          Object.keys(newMyReactions).forEach(userId => {
            if (userId !== myId.value && oldMyReactions[userId] !== newMyReactions[userId]) {
              const reactorName = data[myLabId.value]?.members?.[userId]?.name || findMemberName(userId);
              const emoji = newMyReactions[userId] === 'good' ? '👍' : '👎';
              sendNotification({
                title: `❤️ リアクション通知`,
                body: `${reactorName} さんがあなたの行動に ${emoji} しました`
              });
            }
          });
        }
      }
      isFirstLabLoad = false;

      labs.value = data;
      if (labs.value[myLabId.value]?.members?.[myId.value]) {
         myColor.value = labs.value[myLabId.value].members[myId.value].color;
         myStatus.value = labs.value[myLabId.value].members[myId.value].status;
      }
    }
  });

  onValue(chatRef, (snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      const msgArray = Object.values(messages as any)
        .filter((m: any) => !isExpired(m.timestamp))
        .sort((a: any, b: any) => a.timestamp - b.timestamp);
      
      if (!isFirstLoad && msgArray.length > 0 && notifyChat.value) {
        const latestMsg = msgArray[msgArray.length - 1] as any;
        if (latestMsg.sender !== myName.value && latestMsg.sender !== 'SYSTEM') {
          sendNotification({ title: `💬 ${latestMsg.sender}`, body: latestMsg.text });
        }
      }
      isFirstLoad = false;

      chatMessages.value = msgArray;
      nextTick(() => {
        if (chatMessagesRef.value) {
          chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight;
        }
      });
    } else { chatMessages.value = []; }
  });

  update(myMemberRef, {
    name: myName.value, status: '出席', color: myColor.value, action: '', updatedAt: serverTimestamp()
  });
  sendSystemMessage(`${myName.value} が入室（起動）しました`);

  onDisconnect(myMemberRef).update({ status: '欠席', action: '', actionAt: null, reactions: null });
};

watch(myColor, (newColor) => {
  localStorage.setItem('myColor', newColor);
  if(isRegistered.value) {
    update(dbRef(db, `labs/${myLabId.value}/members/${myId.value}`), { color: newColor });
  }
});

const updateName = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const newName = target.value.trim();
  const oldName = localStorage.getItem('myName') || '';
  if (!newName) { myName.value = oldName; return; }
  if (newName === oldName) return;

  localStorage.setItem('myName', newName);
  myName.value = newName;
  update(dbRef(db, `labs/${myLabId.value}/members/${myId.value}`), { name: newName });
  sendSystemMessage(`${oldName} が名前を「${newName}」に変更しました`);
};

const changeLab = async (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const newLab = target.value;
  const oldLab = localStorage.getItem('myLabId');
  if (oldLab === newLab) return;

  if (oldLab) { await update(dbRef(db, `labs/${oldLab}/members`), { [myId.value]: null }); }

  myLabId.value = newLab;
  localStorage.setItem('myLabId', newLab);

  await update(dbRef(db, `labs/${newLab}/members/${myId.value}`), {
    name: myName.value, status: myStatus.value, color: myColor.value, action: '', updatedAt: serverTimestamp()
  });
  sendSystemMessage(`${myName.value} が ${getLabName(oldLab!)} から ${getLabName(newLab)} に移動しました`);
};

const updateMyStatus = (status: Status) => {
  if (myStatus.value === status) return; 
  myStatus.value = status;
  update(dbRef(db, `labs/${myLabId.value}/members/${myId.value}`), { status: status, updatedAt: serverTimestamp() });

  if (status === '出席') sendSystemMessage(`${myName.value} が入室しました`);
  else if (status === '欠席') sendSystemMessage(`${myName.value} が帰宅しました`);
  else if (status === '外出') sendSystemMessage(`${myName.value} が外出しました`);
};

const showActionModal = ref(false);
const activeMemberId = ref('');
const activeLabId = ref('');
const customActionInput = ref('');
const templates = ['飯行きたい', 'キャッチボール', 'コンビニ', '休憩中'];

const openActionModal = (labId: string, memberId: string) => {
  if (String(memberId) !== myId.value) return;
  activeLabId.value = labId;
  activeMemberId.value = String(memberId);
  showActionModal.value = true;
};

const toggleReaction = (labId: string, memberId: string, type: 'good' | 'bad') => {
  const m = labs.value[labId]?.members?.[memberId];
  if (!m) return;
  const reactions = m.reactions || {};
  if (reactions[myId.value] === type) { delete reactions[myId.value]; } 
  else { reactions[myId.value] = type; }
  update(dbRef(db, `labs/${labId}/members/${memberId}`), { reactions });
};

const applyAction = (text: string) => {
  update(dbRef(db, `labs/${activeLabId.value}/members/${activeMemberId.value}`), { 
  action: text, 
  actionAt: text ? serverTimestamp() : null, 
  updatedAt: serverTimestamp(),
  reactions: null // 🔥 古いリアクションをリセット！
});
  showActionModal.value = false;
  customActionInput.value = '';
};

const chatInput = ref('');
const sendMessage = () => {
  if (!chatInput.value.trim()) return;
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  push(dbRef(db, 'chats'), {
    sender: myName.value, text: chatInput.value, time: timeStr, timestamp: serverTimestamp()
  });
  chatInput.value = '';
};
</script>

<template>
  <div :data-theme="currentTheme" class="theme-container">
    
    <!-- 初期登録用画面 -->
    <div v-if="!isRegistered" class="setup-layout">
      <div class="glass-panel setup-box" data-tauri-drag-region>
        <h2 data-tauri-drag-region>SYSTEM LOGIN</h2>
        <div class="input-group">
          <label>USERNAME</label>
          <input type="text" v-model="myName" placeholder="例: 用皆" />
        </div>
        <div class="input-group">
          <label>SECTOR</label>
          <select v-model="myLabId">
            <option value="lab1">第1研究室</option><option value="lab2">第2研究室</option><option value="lab3">第3研究室</option>
            <option value="lab4">第4研究室</option><option value="lab5">第5研究室</option><option value="lab6">第6研究室</option>
            <option value="lab7">第7研究室</option><option value="lab8">第8研究室</option><option value="lab9">第9研究室</option>
          </select>
        </div>
        <button class="cyber-btn" @click="registerUser" :disabled="!myName">INITIALIZE</button>
      </div>
    </div>

    <!-- メインアプリケーション画面 -->
    <div v-else class="app-layout">
      <header class="app-header glass-panel" data-tauri-drag-region>
        <div class="status-controls">
          <button :class="{ active: myStatus === '出席' }" @click="updateMyStatus('出席')">出席</button>
          <button :class="{ active: myStatus === '外出' }" @click="updateMyStatus('外出')">外出</button>
          <button :class="{ active: myStatus === '欠席' }" @click="updateMyStatus('欠席')">欠席</button>
        </div>
        <h1 class="neon-text" data-tauri-drag-region>LAB MONITORING SYS.</h1>
        
        <div class="header-right">
          <!-- ⚙️ 右上に配置したシンプルな設定ボタン -->
          <button class="settings-toggle-btn" @click="showSettingsModal = true" title="設定を開く">⚙️</button>
        </div>
      </header>

      <main class="labs-area">
        <div class="labs-container">
          <div v-for="(lab, labId) in labs" :key="labId" class="lab-box glass-panel">
            <h2>{{ getLabName(String(labId)) }}</h2>
            <div class="members-list">
              <template v-if="lab.members">
                <div v-for="(member, memberId) in lab.members" :key="memberId" class="member-item">
                  <div 
                    class="member-icon" 
                    :title="`${member.name} (更新: ${formatElapsedTime(member.updatedAt)})`"
                    :class="{'is-absent': member.status === '欠席', 'is-out': member.status === '外出'}"
                    :style="{ 
                      borderColor: member.status !== '欠席' ? member.color : '#333',
                      color: member.status !== '欠席' ? member.color : '#555',
                      boxShadow: member.status !== '欠席' ? `0 0 10px ${member.color}40, inset 0 0 5px ${member.color}20` : 'none',
                      cursor: String(memberId) === myId ? 'pointer' : 'default' 
                    }"
                    @click="openActionModal(String(labId), String(memberId))"
                  >
                    {{ (member.name || '？').substring(0, 2) }}
                    <span class="status-badge" :class="member.status === '出席' ? 'badge-present' : member.status === '外出' ? 'badge-out' : 'badge-absent'"></span>
                  </div>
                  
                  <!-- アクション吹き出し（リアクション強化版） -->
                  <div v-if="member.action && member.status !== '欠席'" class="action-bubble">
                    <span class="action-text-content">{{ member.action }}</span>
                    <div class="reaction-buttons">
                      <!-- 👍 ボタン (件数表示 + ホバーで誰が押したかツールチップ表示) -->
                      <button 
                        @click="toggleReaction(String(labId), String(memberId), 'good')" 
                        :class="{ 'has-reacted': member.reactions?.[myId] === 'good' }"
                        :title="getReactionInfo(member.reactions, 'good').names"
                      >
                        👍 <span class="rx-count" v-if="getReactionInfo(member.reactions, 'good').count > 0">{{ getReactionInfo(member.reactions, 'good').count }}</span>
                      </button>
                      
                      <!-- 👎 ボタン -->
                      <button 
                        @click="toggleReaction(String(labId), String(memberId), 'bad')" 
                        :class="{ 'has-reacted': member.reactions?.[myId] === 'bad' }"
                        :title="getReactionInfo(member.reactions, 'bad').names"
                      >
                        👎 <span class="rx-count" v-if="getReactionInfo(member.reactions, 'bad').count > 0">{{ getReactionInfo(member.reactions, 'bad').count }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="empty-lab">NO SIGNAL</div>
            </div>
          </div>
        </div>
      </main>

      <footer class="chat-area glass-panel">
        <div class="chat-messages" ref="chatMessagesRef">
          <div v-for="msg in chatMessages" :key="msg.timestamp" class="chat-message">
            <span class="chat-time">[{{ msg.time }}]</span>
            <span :class="msg.sender === 'SYSTEM' ? 'chat-system' : 'chat-sender'">
              {{ msg.sender === 'SYSTEM' ? '> SYSTEM:' : msg.sender + ':' }}
            </span>
            <span class="chat-text" :class="{ 'system-text': msg.sender === 'SYSTEM' }">{{ msg.text }}</span>
          </div>
        </div>
        <div class="chat-input-area">
          <input type="text" v-model="chatInput" placeholder="Command..." @keypress.enter="sendMessage" />
          <button class="cyber-btn" @click="sendMessage">SEND</button>
        </div>
      </footer>

      <!-- 💬 コメント設定モーダル -->
      <div v-if="showActionModal" class="modal-overlay" @click.self="showActionModal = false">
        <div class="modal-content glass-panel">
          <h3 class="neon-text">SET STATUS</h3>
          <div class="template-buttons">
            <button class="cyber-btn outline" v-for="temp in templates" :key="temp" @click="applyAction(temp)">{{ temp }}</button>
          </div>
          <div class="custom-action">
            <input type="text" v-model="customActionInput" placeholder="Manual Override..." @keypress.enter="applyAction(customActionInput)" />
            <button class="cyber-btn" @click="applyAction(customActionInput)">EXEC</button>
          </div>
          <button class="clear-btn" @click="applyAction('')">[ CLEAR ]</button>
          <p class="note">※コメント・アクションは1時間で自動消去されます</p>
        </div>
      </div>

      <!-- ⚙️【新設】コントロールパネル（設定用モーダル） -->
      <div v-if="showSettingsModal" class="modal-overlay" @click.self="showSettingsModal = false">
        <div class="modal-content glass-panel settings-modal">
          <h3 class="neon-text">SETTINGS PANEL</h3>
          <div class="settings-scroll-area">
            
            <div class="setting-row">
              <label>ユーザー名</label>
              <input type="text" :value="myName" @change="updateName" class="setting-input-text" maxlength="6" />
            </div>

            <div class="setting-row">
              <label>所属セクター</label>
              <select :value="myLabId" @change="changeLab" class="setting-select">
                <option value="lab1">第1研究室</option><option value="lab2">第2研究室</option><option value="lab3">第3研究室</option>
                <option value="lab4">第4研究室</option><option value="lab5">第5研究室</option><option value="lab6">第6研究室</option>
                <option value="lab7">第7研究室</option><option value="lab8">第8研究室</option><option value="lab9">第9研究室</option>
              </select>
            </div>

            <div class="setting-row">
              <label>UIテーマ</label>
              <select :value="currentTheme" @change="e => changeTheme((e.target as HTMLSelectElement).value)" class="setting-select highlight-select">
                <option value="cyber">Cyberpunk (近未来)</option>
                <option value="default">Default (モダン)</option>
                <option value="stylish">Nordic (おしゃれ)</option>
                <option value="retro">Retro Pop (レトロ)</option>
              </select>
            </div>

            <div class="setting-row">
              <label>IDカラー</label>
              <input type="color" v-model="myColor" class="setting-color-picker" />
            </div>

            <hr class="setting-divider" />

            <h4 class="setting-sub-title">🔔 通知カスタマイズ</h4>
            
            <div class="setting-toggle-row">
              <span>チャット受信通知</span>
              <input type="checkbox" v-model="notifyChat" id="toggle-chat" class="toggle-cb" /><label for="toggle-chat"></label>
            </div>

            <div class="setting-toggle-row">
              <span>ステータス変更通知</span>
              <input type="checkbox" v-model="notifyStatus" id="toggle-status" class="toggle-cb" /><label for="toggle-status"></label>
            </div>

            <div class="setting-toggle-row">
              <span>自分へのリアクション通知</span>
              <input type="checkbox" v-model="notifyReaction" id="toggle-rx" class="toggle-cb" /><label for="toggle-rx"></label>
            </div>

          </div>
          <button class="cyber-btn setting-close-btn" @click="showSettingsModal = false">CLOSE</button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=Space+Mono&display=swap');

/* ==========================================================================
   各テーマのカラーパレット定義
   ========================================================================== */
.theme-container[data-theme="default"] {
  --bg-color: #f1f5f9; --bg-gradient: none; --panel-bg: rgba(255, 255, 255, 0.9);
  --panel-border: rgba(15, 23, 42, 0.1); --panel-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  --text-main: #0f172a; --text-muted: #64748b; --accent-color: #2563eb; --accent-glow: rgba(37, 99, 235, 0.1);
  --btn-bg: rgba(37, 99, 235, 0.08); --input-bg: #ffffff; --input-border: #cbd5e1;
  --chat-system: #b45309; --panel-radius: 8px; --bubble-bg: rgba(37, 99, 235, 0.05);
}
.theme-container[data-theme="cyber"] {
  --bg-color: #050a15; --bg-gradient: radial-gradient(circle at 15% 50%, rgba(0, 240, 255, 0.05) 0%, transparent 50%), radial-gradient(circle at 85% 30%, rgba(255, 0, 60, 0.03) 0%, transparent 50%);
  --panel-bg: rgba(10, 15, 30, 0.65); --panel-border: rgba(0, 240, 255, 0.15); --panel-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  --text-main: #e2e8f0; --text-muted: #94a3b8; --accent-color: #00f0ff; --accent-glow: rgba(0, 240, 255, 0.6);
  --btn-bg: rgba(0, 240, 255, 0.1); --input-bg: rgba(0, 0, 0, 0.5); --input-border: #334155;
  --chat-system: #f59e0b; --panel-radius: 2px; --bubble-bg: rgba(0, 240, 255, 0.05);
}
.theme-container[data-theme="stylish"] {
  --bg-color: #edf0eb; --bg-gradient: none; --panel-bg: #ffffff;
  --panel-border: rgba(85, 95, 80, 0.15); --panel-shadow: 0 10px 25px rgba(60, 65, 55, 0.04);
  --text-main: #383a36; --text-muted: #8a8d87; --accent-color: #556b2f; --accent-glow: rgba(85, 107, 47, 0.05);
  --btn-bg: #e2e7dd; --input-bg: #fafbfa; --input-border: #ccd2c7;
  --chat-system: #8b4513; --panel-radius: 16px; --bubble-bg: #f3f6f1;
}
.theme-container[data-theme="retro"] {
  --bg-color: #2b201a; --bg-gradient: repeating-linear-gradient(0deg, rgba(0,0,0,0.08), rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px);
  --panel-bg: #fffcf2; --panel-border: #2b201a; --panel-shadow: 5px 5px 0px #1a1310;
  --text-main: #2b201a; --text-muted: #6d594f; --accent-color: #e76f51; --accent-glow: rgba(231, 111, 81, 0.2);
  --btn-bg: #f4a261; --input-bg: #ffffff; --input-border: #2b201a;
  --chat-system: #e76f51; --panel-radius: 0px; --bubble-bg: #f2ebd9;
}

/* 基本レイアウト */
:global(body) { background-color: #000; margin: 0; overflow: hidden; }
.theme-container { width: 100vw; height: 100vh; background-color: var(--bg-color); background-image: var(--bg-gradient); color: var(--text-main); transition: background 0.3s, color 0.3s; overflow: hidden; }
.glass-panel { background: var(--panel-bg); backdrop-filter: blur(10px); border: 1px solid var(--panel-border); box-shadow: var(--panel-shadow); border-radius: var(--panel-radius); transition: all 0.3s; }
.neon-text { font-family: 'Orbitron', sans-serif; color: var(--accent-color); text-shadow: 0 0 8px var(--accent-glow); letter-spacing: 1px; }

.cyber-btn { background: var(--btn-bg); border: 1px solid var(--accent-color); color: var(--text-main); padding: 6px 12px; font-family: 'Orbitron', sans-serif; cursor: pointer; transition: all 0.2s; border-radius: var(--panel-radius); text-shadow: 0 0 5px var(--accent-glow); }
.cyber-btn:hover:not(:disabled) { box-shadow: 0 0 8px var(--accent-color); opacity: 0.9; }
.cyber-btn:disabled { border-color: #64748b; color: #64748b; cursor: not-allowed; text-shadow: none; background: transparent; }
.cyber-btn.outline { background: transparent; }

.setup-layout { display: flex; align-items: center; justify-content: center; height: 100vh; font-family: 'Noto Sans JP', sans-serif; }
.setup-box { padding: 30px; width: 280px; text-align: center; }
.setup-box h2 { margin-top: 0; font-family: 'Orbitron', sans-serif; color: var(--accent-color); text-shadow: 0 0 5px var(--accent-glow); }
.input-group { margin-bottom: 15px; text-align: left; }
.input-group label { display: block; font-family: 'Orbitron', sans-serif; font-size: 0.75em; color: var(--text-muted); margin-bottom: 4px; }
.input-group input, .input-group select { width: 100%; padding: 8px; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); border-radius: 4px; box-sizing: border-box; }

.app-layout { display: flex; flex-direction: column; height: 100vh; font-family: 'Noto Sans JP', sans-serif; overflow: hidden; }
.app-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; z-index: 10; border-radius: 0; border-top: none; border-left: none; border-right: none; }
.app-header h1 { margin: 0; font-size: 1.1em; pointer-events: none; }
.status-controls button { padding: 4px 10px; font-size: 0.8em; cursor: pointer; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-muted); margin-right: 4px; border-radius: 4px; transition: 0.2s; }
.status-controls button.active { border-color: var(--accent-color); color: var(--accent-color); background: var(--btn-bg); box-shadow: 0 0 8px var(--accent-glow); }

/* ⚙️ 設定用ギアボタンの装飾 */
.settings-toggle-btn { background: transparent; border: none; font-size: 1.3em; cursor: pointer; transition: transform 0.3s ease; padding: 4px 8px; }
.settings-toggle-btn:hover { transform: rotate(45deg); }

.labs-area { flex: 1; overflow-y: auto; padding: 15px; }
.labs-container { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; align-items: flex-start; }
.lab-box { padding: 15px; width: 190px; }
.lab-box h2 { margin: 0 0 12px 0; border-bottom: 1px solid var(--panel-border); padding-bottom: 5px; font-size: 0.9em; text-align: center; letter-spacing: 2px; }
.members-list { display: flex; flex-direction: column; gap: 12px; }
.member-item { display: flex; align-items: center; }

.member-icon { position: relative; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8em; border: 1.5px solid; background: var(--input-bg); flex-shrink: 0; transition: all 0.3s ease; }
.is-absent { opacity: 0.4; filter: grayscale(100%); }
.is-out { opacity: 0.8; border-style: dashed !important; }
.status-badge { position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--panel-bg); }
.badge-present { background-color: #39ff14; box-shadow: 0 0 5px #39ff14; }
.badge-out { background-color: #ff9800; box-shadow: 0 0 5px #ff9800; }
.badge-absent { background-color: #64748b; }
.empty-lab { color: var(--text-muted); font-family: 'Orbitron', sans-serif; font-size: 0.75em; text-align: center; padding: 10px 0; }

.action-bubble { display: flex; flex-direction: column; gap: 4px; margin-left: 12px; background: var(--bubble-bg); border: 1px solid var(--panel-border); padding: 4px 8px; border-radius: 4px; font-size: 0.75em; position: relative; word-break: break-all; line-height: 1.2; }
.action-bubble::before { content: ''; position: absolute; left: -5px; top: 12px; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-right: 5px solid var(--panel-border); }
.reaction-buttons { display: flex; gap: 8px; margin-top: 2px; border-top: 1px solid var(--panel-border); padding-top: 2px; }
.reaction-buttons button { background: transparent; border: none; cursor: pointer; font-size: 0.9em; padding: 0 2px; opacity: 0.4; filter: grayscale(100%); transition: 0.15s; position: relative; display: flex; align-items: center; gap: 2px; color: var(--text-main); }
.reaction-buttons button:hover, .reaction-buttons button.has-reacted { opacity: 1; filter: grayscale(0%); }
.rx-count { font-size: 0.8em; font-weight: bold; font-family: 'Orbitron', sans-serif; }

.chat-area { height: 130px; border-radius: 0; border-bottom: none; border-left: none; border-right: none; display: flex; flex-direction: column; }
.chat-messages { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; font-family: 'Space Mono', monospace; font-size: 0.85em; }
.chat-time { color: var(--text-muted); margin-right: 6px; }
.chat-sender { font-weight: bold; margin-right: 4px; }
.chat-system { color: var(--chat-system); font-weight: bold; margin-right: 4px; }
.system-text { color: var(--chat-system); font-style: italic; }
.chat-input-area { display: flex; padding: 6px 10px; border-top: 1px solid var(--panel-border); }
.chat-input-area input { flex: 1; padding: 6px 10px; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); border-radius: 4px; outline: none; font-size: 0.85em; }
.chat-input-area button { margin-left: 8px; font-size: 0.75em; padding: 4px 12px; }

.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(3px); }
.modal-content { padding: 20px; width: 280px; text-align: center; }
.template-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 15px; }
.custom-action { display: flex; gap: 8px; margin-bottom: 15px; }
.custom-action input { flex: 1; padding: 6px; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); border-radius: 4px; font-size: 0.85em; }
.clear-btn { background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.75em; }
.note { font-size: 0.7em; color: #f59e0b; margin-top: 10px; }

/* ⚙️ コントロールパネル（設定画面）専用スタイル */
.settings-modal { width: 320px; text-align: left; padding: 22px; max-height: 80vh; display: flex; flex-direction: column; }
.settings-modal h3 { margin: 0 0 15px 0; text-align: center; font-size: 1.1em; }
.settings-scroll-area { flex: 1; overflow-y: auto; margin-bottom: 15px; padding-right: 4px; }
.setting-row { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.setting-row label { font-size: 0.8em; color: var(--text-muted); font-weight: bold; }
.setting-input-text, .setting-select { padding: 8px; background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); border-radius: 4px; font-size: 0.9em; outline: none; }
.highlight-select { border-color: var(--accent-color); font-weight: bold; color: var(--accent-color); }
.setting-color-picker { background: transparent; border: 1px solid var(--input-border); cursor: pointer; width: 100%; height: 35px; border-radius: 4px; padding: 0; }
.setting-divider { border: 0; border-top: 1px dashed var(--panel-border); margin: 15px 0; }
.setting-sub-title { margin: 0 0 12px 0; font-size: 0.85em; color: var(--accent-color); letter-spacing: 1px; }

/* トグルスイッチ（チェックボックスカスタム） */
.setting-toggle-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.85em; }
.toggle-cb { display: none; }
.toggle-cb + label { position: relative; display: inline-block; width: 36px; height: 18px; background-color: var(--input-border); border-radius: 9px; cursor: pointer; transition: 0.3s; }
.toggle-cb + label::after { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 50%; background-color: var(--panel-bg); top: 2px; left: 2px; transition: 0.3s; }
.toggle-cb:checked + label { background-color: var(--accent-color); }
.toggle-cb:checked + label::after { left: 20px; }
.setting-close-btn { width: 100%; margin-top: 10px; }
</style>