---
title: 什麼是無人機足球？該怎麼玩？
description: 一次看懂場地、球機、人數與得分規則——看完這篇就知道這遊戲怎麼玩。
order: 1
updated_at: "2026-07-20"
---

無人機足球（Drone Soccer，又稱無人機飛球）是一項對抗型的飛行運動：每位選手駕駛一台包在球形防護殼裡的小型無人機，在一個立體的網籠場地裡互相攻防，設法讓自家「前鋒」穿越對方的球門環得分。它 2016 年起源於韓國，玩起來同時吃飛行手感、器材維護和團隊配合，因此常被學校當成科技教育的入門。名稱由來另見 [無人機足球和無人機飛球有什麼不同](/learn/naming-drone-soccer-vs-flyball)。

下面這張圖，是以教育與民間最常用的 [FAI F9A-B（20 公分級）](/rules/fai-f9a-b-2026) 為例的場地與玩法示意：

<figure role="img" aria-label="無人機足球場地側視示意圖：長 6 公尺、高 3 公尺的網籠，中線分兩半場，兩端各有一個球門環，兩隊球機在場中攻防，只有前鋒能穿越對方球門環得分。">
<svg viewBox="0 0 640 300" style="width:100%;height:auto;font-family:inherit" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="wds-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="var(--color-text-muted)"/>
    </marker>
  </defs>
  <rect x="4" y="4" width="632" height="292" rx="12" fill="var(--color-surface-muted)" stroke="var(--color-border)"/>
  <text x="320" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="var(--color-text)">FAI F9A-B（20 公分級）場地・側視示意</text>

  <!-- 護籠 -->
  <rect x="70" y="72" width="500" height="170" rx="4" fill="none" stroke="var(--color-text-muted)" stroke-width="2.5"/>
  <!-- 中線 -->
  <line x1="320" y1="72" x2="320" y2="242" stroke="var(--color-text-muted)" stroke-dasharray="6 6" opacity="0.7"/>
  <text x="320" y="88" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">中線</text>
  <text x="185" y="234" text-anchor="middle" font-size="12" fill="var(--color-text-muted)">A 隊半場</text>
  <text x="455" y="234" text-anchor="middle" font-size="12" fill="var(--color-text-muted)">B 隊半場</text>

  <!-- 球門環（側視為立於兩端的環） -->
  <ellipse cx="95" cy="140" rx="9" ry="30" fill="none" stroke="var(--color-tech)" stroke-width="6"/>
  <ellipse cx="545" cy="140" rx="9" ry="30" fill="none" stroke="var(--color-tech)" stroke-width="6"/>
  <text x="95" y="120" text-anchor="middle" font-size="11" fill="var(--color-tech)">球門環</text>
  <text x="545" y="120" text-anchor="middle" font-size="11" fill="var(--color-tech)">球門環</text>

  <!-- 起飛區 -->
  <rect x="78" y="226" width="40" height="14" rx="2" fill="var(--color-surface)" stroke="var(--color-border)"/>
  <rect x="522" y="226" width="40" height="14" rx="2" fill="var(--color-surface)" stroke="var(--color-border)"/>
  <text x="98" y="237" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">起飛區</text>
  <text x="542" y="237" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">起飛區</text>

  <!-- B 隊球機（橘） -->
  <circle cx="490" cy="175" r="9" fill="var(--color-action)"/>
  <circle cx="440" cy="128" r="9" fill="var(--color-action)"/>
  <circle cx="395" cy="160" r="9" fill="var(--color-action)"/>
  <!-- A 隊球機（藍），含前鋒 -->
  <circle cx="150" cy="175" r="9" fill="var(--color-tech)"/>
  <circle cx="200" cy="128" r="9" fill="var(--color-tech)"/>
  <circle cx="262" cy="152" r="9" fill="var(--color-tech)"/>
  <circle cx="262" cy="152" r="14" fill="none" stroke="var(--color-text)" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="262" y="128" text-anchor="middle" font-size="11" font-weight="700" fill="var(--color-text)">前鋒</text>

  <!-- 前鋒穿門路線 -->
  <path d="M276 150 Q410 96 532 138" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#wds-arrow)"/>
  <text x="405" y="112" text-anchor="middle" font-size="11" fill="var(--color-text-muted)">前鋒穿越對方球門環得分</text>

  <!-- 尺寸 -->
  <text x="320" y="266" text-anchor="middle" font-size="12" fill="var(--color-text-muted)">◄──────── 長 6 公尺 ────────►</text>
  <text x="52" y="160" text-anchor="middle" font-size="12" fill="var(--color-text-muted)" transform="rotate(-90 52 160)">高 3 公尺</text>
</svg>
<figcaption style="font-size:0.9rem;color:var(--color-text-muted);margin-top:6px">藍、橘各為一隊，每台是一位選手的球機；虛線圈者為該隊「前鋒」，全隊只有它穿越對方球門環才算得分。</figcaption>
</figure>

## 規格速覽（FAI F9A-B 20 公分級）

| 項目 | 規格 |
| --- | --- |
| 場地（護籠） | 長 6 m × 寬 3 m × 高 3 m，中線分成兩個半場 |
| 球門環 | 圓環，外徑 70 cm／內徑 40 cm，設於底線內 1 m 處 |
| 每隊人數 | 場上 3–5 人，每人各操控一台球機 |
| 球機 | 直徑 20 cm、重量 ≤ 300 g、電池 ≤ 4S、螺旋槳 ≤ 3 吋，須有 fail-safe |
| 賽制 | 三局兩勝，每局 180 秒（3 分鐘） |
| 得分 | 只有該隊指定的「前鋒」穿越對方球門環才算 1 分 |

以上是 FAI F9A-B 的數字，取自站內 [FAI F9A-B 規則](/rules/fai-f9a-b-2026)；[天穹盃](/rules/skycup-2026)、[FIDA Class 40](/rules/fida-2026) 的場地大小與人數各有不同，備賽以該賽事簡章為準。

## 怎麼玩：一場比賽的流程

1. **組隊、檢錄**：每隊 3–5 人，各帶一台 20 公分球機。開賽前裁判逐台檢錄，確認規格與 fail-safe（訊號中斷就自動停馬達）都合規才能上場，安全細節見 [安全須知](/learn/safety-guidelines)。
2. **指定前鋒**：每隊指定一名 [前鋒（Striker）](/learn/striker-explained)，用可辨識的外觀或燈光標記出來——全場只有它穿門能得分。
3. **開打**：雙方各自從己方起飛區起飛。前鋒在隊友掩護下找空隙、切穿對方的球門環；其餘隊員負責替前鋒開路、干擾對手，並擋下對方前鋒。
4. **得分後退回半場**：前鋒進球後，全隊要先退回己方半場（以中線為界）才能再次進攻；沒退回就搶攻會被判罰。
5. **算分、定勝負**：每局 180 秒內比進球數，多的一方贏得該局；先贏 2 局的隊伍拿下整場。賽制與勝負判定的細節見 [一場比賽怎麼進行](/learn/match-format)。

一隊到底幾個人、各站什麼位置，見 [一隊有幾個人](/learn/team-size)；第一次要上場，看 [第一次參加比賽要準備什麼](/learn/first-competition-checklist)。

## 和傳統足球差在哪

名稱借了「足球」，比賽邏輯卻更像立體版的對抗球類：

- 場地是三維空間，球機能飛高飛低，攻防在半空中展開。
- 得分只能由指定前鋒完成，其他隊員不能直接進球，所以講究分工與掩護。
- 球機外層有防護殼，碰撞風險低，近距離纏鬥反而成了看點。

無人機足球目前在全球約 20 個國家推廣，並自 2019 年起由國際航空運動總會（FAI）列為正式航空運動項目，發展歷程見 [歷史與起源](/learn/history-and-origin)。
