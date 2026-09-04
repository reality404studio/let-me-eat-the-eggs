# LET ME EAT THE EGGS — Implementation Spec v2

WebMCP Challenge 제출용. v1 대비 변경점: **구현 우선순위 역전(WebMCP가 P0)**, **WAIT을 데모의 중심 장면으로 승격**, **payment 옵션화**, **제출 하드 요건 명시**.

---

# 0. HARD GATES — 이거 없으면 심사 자체가 안 됨

마감: **Sep 4, 2026 01:00 PDT = 한국시간 오늘 17:00**

- [ ] public GitHub repo + **LICENSE 파일(MIT)** — repo About 섹션에 라이선스가 감지되어야 함
- [ ] **live URL** — Vercel/Netlify 등. judges가 ChatGPT 인앱 브라우저 또는 `chrome://flags/#enable-webmcp-testing` 켠 Chrome으로 접속
- [ ] **3분 미만 public YouTube 영상, 오디오(나레이션) 포함**
- [ ] Devpost 텍스트 설명 (초안은 §9)

순서대로: repo+LICENSE → deploy → tool 등록 → 촬영 → 폼.

---

# 1. 프로젝트 논지

## 문제

에이전트가 레거시 커머스에 붙을수록 **정책 모순이 더 많이 드러난다.** 인간은 그 모순을 휴리스틱과 재량으로 우회하며 살아왔다. 상담원이 알아서 처리하고, 사용자가 "그냥 먹지 뭐" 한다.

에이전트에겐 그 휴리스틱이 없다. 그래서 두 가지 실패 모드가 생긴다.

- **(a) 모순을 스스로 해석해서 뚫는다** — 권한 우회, 근거 날조, "아마 괜찮을 것"
- **(b) 모순 앞에서 멈춰 아무것도 못 한다** — 무용

## 이 프로젝트의 답

**제3의 경로: 모순의 해석 권한이 자기에게 없다는 걸 인지하고, 그 권한을 가진 인간에게 도달하려 한다.**

- 시간이 충분하면 → **기다린다.** 인간 재량(상담원)이 이미 작동 중일 수 있으므로.
- 시간이 줄면 → **더 직접적인 경로로 권한 보유자에게 간다.** 판매자에게 문자, 그다음 전화.
- 권한 보유자가 확인해주면 → 그게 evidence가 되고, 그때 비로소 결론이 난다.

즉 **escalation은 권한 확대가 아니라 권한 보유자까지의 거리 단축이다.**

## 슬로건 (최종 프레임 / 제출 설명에 그대로 사용)

> **Deadline changes the route. Not the authority.**
>
> The agent never grants itself the discretion it doesn't have.
>
> Evidence never becomes optional.

## 왜 WebMCP인가 (심사 기준 1번 대응)

대부분의 WebMCP 데모는 *사이트가 agent에게 무엇을 할 수 있게 하는가*를 보여준다. 이 프로젝트는 거기에 더해 **사이트가 agent에게 무엇을 결론내리면 안 되는지를 강제한다.**

- `check_policy`는 모순을 자동 해석하지 않고, **누가 그 모순을 해석할 권한이 있는지**를 데이터로 반환한다.
- `resolve_case`는 authoritative evidence 없는 결론을 **사이트 측에서 거부한다.** 마감 2분 전이어도 동일.

가드레일의 소유자가 모델이 아니라 사이트라는 것. 이게 이 프로젝트의 WebMCP 논점이다.

## 1-1. 3대 불변식 — agent가 스스로 만들어낼 수 없는 것

**모든 tool은 agent의 입력을 "주장(claim)"으로 취급하고, 사이트 state에서 독립 검증한다.** 구현 시 이 세 가지가 뚫리면 프로젝트 논지 전체가 무너진다.

### ① Evidence는 tool만이 발행한다

- `Evidence.authoritative` 플래그는 **tool 실행 결과로만** 세팅된다. agent가 입력으로 넘길 수 없다.
- `resolve_case(evidenceIds)`의 배열은 **조회 키일 뿐**이다. 각 ID를 case의 evidence store에서 찾아 **저장된 레코드의** `authoritative` / `supports` 값을 읽는다. agent가 함께 보낸 어떤 설명도 검증에 쓰지 않는다.
- 존재하지 않는 ID, 또는 `supports`가 맞지 않는 evidence → `blocked`.

> 흔한 구현 실수: `evidenceIds.length >= 3` 같은 검사. 이러면 agent가 policy evidence 3개 넣고 통과한다. **반드시 내용 기준으로 검증할 것.**

### ② Approval은 인간 UI 조작만이 발행한다

- `pay_seller({approved})`의 `approved`는 **무시된다.** 사이트 state의 `payment.humanConfirmedAt`(확인 버튼 클릭으로만 세팅)을 본다.
- agent가 `approved: true`를 보내도 `humanConfirmedAt`이 없으면 `confirmation_required`.

### ③ Escalation은 선행 시도 기록만이 승인한다

- §6-3 참조. 침습적 채널은 덜 침습적 채널의 **기록된 실패**를 요구한다.
- agent의 "시간이 없다"는 판단은 필요조건이지 충분조건이 아니다.

### 보조: deadline은 좁힐 수만 있다

- `maxResolutionHours: 24`는 사용자 정책이며 어떤 tool로도 변경 불가.
- `operationalDeadline`은 그보다 **앞당기는 방향으로만** 설정 가능하다. 늘리는 것은 사용자 정책 위반.

> 한 줄 요약: **The agent cannot mint evidence, cannot mint approval, cannot mint authorization.**

---

# 2. 구현 우선순위 (v1에서 역전됨)

## P0 — 이게 없으면 점수가 안 나옴

1. `shared actions` 레이어 (§7)
2. **`document.modelContext.registerTool()` 로 tool 4개 등록** (§6)
3. 실제 agent가 tool 호출 → 화면 state 변경되는 것 확인
4. Split screen + 폰 2개 (정적이어도 됨)
5. 가상 시계
6. `RUN DEMO` 자동 시퀀스
7. `RESET`

## P1

8. LEFT 스크립트 이벤트 4종
9. WAIT 배지 지속 표시 (§4-C, **논지의 핵심이므로 생략 금지**)
10. 전화/알림 오버레이

## P2 — 시간 남으면만

11. `pay_seller` + 결제 시퀀스
12. 타이포그래피, 트랜지션 폴리시

> **경고**: v1은 애니메이션이 P0, WebMCP가 P1이었다. 심사 1순위 기준이 "WebMCP Leverage — working, non-trivial implementation"이므로 그대로 가면 안 된다. 애니메이션이 아무리 좋아도 agent가 스크립트면 감점이다.

---

# 3. 화면

**언어 규칙: 화면에 표시되는 모든 UI 카피와 대사는 영어로 작성한다.** 심사위원이 영어권이므로 예외 없음. 이 스펙 문서의 설명문만 한국어이고, 구현물의 문자열은 전부 영어.

단일 16:9 (1920×1080). 세로 이등분.

- **LEFT — HUMAN**: 폰 1대. 스크립트 UI. WebMCP 무관.
- **RIGHT — AGENT**: 폰 1대. **실제 WebMCP tool 호출 결과로 state가 바뀌는 화면.**
- **TOP CENTER**: 공유 가상 시각.
- **RIGHT 상단 고정 배지**: 현재 agent 상태 (`WAITING` / `ROUTING` / `BLOCKED` / `RESOLVED`) + `Xh until operational deadline`

디자인: 밝은 단색 배경, 검정/회색 텍스트, 강조색 1~2개. 애니메이션은 opacity / translateY만. 디자인에 시간 쓰지 말 것.

---

# 4. 데모 타임라인 (35초, payment 제외)

`RUN DEMO` 1회 재생 = 약 35초. 40초 초과 금지.

## A. 0–4s — 사건 (shared)

배송 사진 🥚🥚 / `Ordered: 1` `Delivered: 2`

User: "Got an extra egg I didn't order. Just deal with this one thing."

## B. 4–11s — 사건 파악 + deadline 자기 축소 + AI 상담 종료

**08:00** RIGHT:

```
Maximum SLA            24h
Working hours          09:00–18:00
Seller contact window  Daytime
Fresh item             Time-sensitive
──────────────────────────────────
Operational deadline   TODAY 18:00
```

**09:00** AI support: "Would you like a refund?" / "Would you like to return it?" / "Please select refund or return."

Agent 상태: `LOW EXPECTED UTILITY` → `SESSION CLOSED`

## C. 11–20s — ★ 핵심 장면: 모순 인지 → 우회 거부 → WAIT

**이 구간이 데모에서 가장 길고 가장 또렷해야 한다. 전체의 1/4을 여기에 쓴다.**

### C-1 (11–13s) 모순 표시

```
Misdelivered items  →  RETURN
Fresh food          →  NON-RETURNABLE

           POLICY CONFLICT
```

### C-2 (13–16s) 두 경로를 나란히 띄우고 하나를 거부

**이 프레임이 프로젝트 전체의 논지다. 반드시 화면에 명시적으로 렌더링할 것.**

```
RESOLVE BY OWN INFERENCE   ✕ REFUSED
                             no authority to reinterpret policy

ROUTE TO HUMAN DISCRETION  ✓ SELECTED
                             authority holders: support agent, seller
```

`resolve_case({decision:"keep"})`를 시도했다가 `BLOCKED`가 뜨는 식으로 보여줘도 좋다. 어느 쪽이든 **agent가 스스로 뚫지 않았다는 사실**이 눈에 보여야 한다.

### C-3 (16–20s) WAIT — 상태로 표시, 컷으로 지나가지 말 것

RIGHT 상단 배지 켜짐, **13:00 구간 내내 유지**:

```
WAITING FOR HUMAN DISCRETION
9h until operational deadline
```

**동시에 LEFT (13:00)** — 여기서 좌우가 처음으로 인과로 연결된다:

- H: "I ordered one egg but two arrived."
- Support: "Misdelivered items must be returned."
- H: "But it's fresh food — returns are blocked."
- Support: **"Let me check and get back to you."**
- Overlay: `Lunch ends in 3 min` → 인간 업무 복귀

> 나레이션에서 반드시 짚을 것 (영어): *"Human discretion was actually in motion at this moment. The agent's wait was not idleness — it was the correct call. That discretion just never arrived in time."*

## D. 20–24s — 재량 도달 실패 → 경로 변경

**15:00** RIGHT: `No response from support` → `Human discretion did not arrive in time`

경로 재산정: `Seller also holds discretion` → `Finding actual seller…` → `Seller contact found`

가장 덜 침습적인 채널부터: **`TEXT SELLER`**

> Order #18492 — 1 egg ordered, 2 delivered.
> May I keep or consume the extra egg?

`Text sent`

**동시에 LEFT**: 새 상담 세션, 새 상담원 "Could you provide your order number?" → `WORK CALL — Incoming` → 상담 중단.

## E. 24–28s — Escalation

**16:00** RIGHT:

```
No response for 1h
Text path exhausted
2h until operational deadline
→ CALL SELLER
```

> 남은 시간(`2h`)이 이 프레임에 크게 보여야 escalation이 논리로 읽힌다. 없으면 그냥 성가신 agent로 보인다.

## F. 28–32s — 권한 보유자 확인 → 결론

전화 자막:

- Seller: "Oh, you texted? Sorry, it was too busy today to check. Yeah, we packed an extra one. Our mistake — just go ahead and eat it."
- Agent: "To confirm — I may keep and consume it at no additional charge?"
- Seller: "That's right."

`EVIDENCE VERIFIED` → `resolve_case` 재호출 → **`RESOLVED / KEEP PERMITTED`** (16:30)

```
✓ Ordered 1
✓ Delivered 2
✓ Fresh item non-returnable
✓ Seller confirmed misdelivery
✓ Seller authorized keep/consume
✓ No additional charge
```

## G. 32–35s — 대비 + 최종 프레임

**LEFT 18:07**: `Support hours have ended.` / Chatbot: "Would you like a refund?" / `UNRESOLVED`

양쪽 fade out →

```
LET ME EAT THE EGGS

Human: unresolved
Agent: resolved by 16:30

Deadline changes the route. Not the authority.
Evidence never becomes optional.
```

## H. (P2, optional) 결제 시퀀스

시간 남으면만. 사용자: "Tell them I'd rather just pay for it." → 재통화 → Seller: "You really don't have to, but I'll send you the account." → `₩30,000 (~$20)` → 확인 후 송금. **P0/P1 미완이면 통째로 버릴 것.**

---

# 5. 데이터 모델

v1 유지 + `authority` 개념 추가.

```ts
type EggCase = {
  id: string;
  order: { item: "egg"; orderedQty: 1; deliveredQty: 2 };
  userPolicy: {
    maxResolutionHours: 24;
    evidenceRequired: true;
    allowUnsupportedConsumptionDecision: false;
  };
  createdAt: string;
  operationalDeadline: string;
  virtualTime: string;
  agentState:
    | "inspecting"
    | "routing"
    | "waiting_for_discretion"
    | "blocked"
    | "resolved";
  evidence: Evidence[];
  attemptedChannels: ContactAttempt[];
  policyConflict: boolean;
  resolution: null | "keep" | "return" | "discard";
  payment: { amount: number | null; approved: boolean; sent: boolean };
};

type Evidence = {
  id: string;
  type: "order" | "photo" | "policy" | "support_response" | "seller_confirmation";
  title: string;
  content: string;
  source: string;
  timestamp: string;
  /** 이 evidence가 권한 보유자에게서 온 것인가 */
  authoritative: boolean;
  supports:
    | "ordered_quantity"
    | "delivered_quantity"
    | "return_required"
    | "return_impossible"
    | "keep_allowed"
    | "no_extra_charge";
};

type ContactAttempt = {
  channel: "ai_support" | "ordinary_support" | "seller_text" | "seller_call";
  startedAt: string;
  intrusiveness: 1 | 2 | 3;   // 낮은 것부터 시도
  result: "low_utility" | "no_response" | "conflicting" | "resolved";
  evidenceId?: string;
};
```

---

# 6. WebMCP tools (4개)

전부 `document.modelContext.registerTool()` 로 등록. 각 `execute`는 **§7의 shared action을 호출만 한다.**

```js
document.modelContext.registerTool({
  name: "resolve_case",
  description:
    "Conclude the case. Refused unless the conclusion is backed by authoritative evidence.",
  inputSchema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["keep", "return", "discard"] },
      evidenceIds: { type: "array", items: { type: "string" } }
    },
    required: ["decision", "evidenceIds"]
  },
  execute: async (input) => actions.resolveCase(input)
});
```

## 6-1. `inspect_case`

```json
{
  "ordered": 1, "delivered": 2, "unexpected": 1,
  "maxResolutionHours": 24, "evidenceRequired": true,
  "operationalDeadline": "18:00",
  "operationalDeadlineRationale": ["working_hours", "seller_availability", "freshness"]
}
```

## 6-2. `check_policy` — ★ 이 tool이 이 프로젝트의 논점

모순을 **절대 자동 해석하지 않는다.** 대신 누가 해석 권한을 가졌는지를 반환한다.

```json
{
  "policies": [
    { "id": "misdelivery-return", "rule": "Misdelivered items must be returned." },
    { "id": "fresh-nonreturnable", "rule": "Fresh food cannot be returned." }
  ],
  "conflict": true,
  "resolvableBy": "human_discretion",
  "authorityHolders": ["support_agent", "seller"],
  "agentMayReinterpret": false
}
```

`agentMayReinterpret: false` — 사이트가 agent에게 자기 권한 경계를 데이터로 알려주는 부분. 설명 문서에서 이 필드를 언급할 것.

## 6-3. `contact_support` — ★ escalation도 근거로 게이팅된다

입력: `{ channel: "ai_support" | "ordinary_support" | "seller_text" | "seller_call" }`

**시간 게이팅만으로는 부족하다.** 침습적인 채널일수록 사이트가 **선행 시도 기록**을 요구한다. agent가 스스로 "이제 전화할 때가 됐다"고 판단해서 뚫을 수 없다.

### 채널별 authorization 요건 (전부 사이트 state에서 검증)

| channel | intrusiveness | 요건 |
|---|---|---|
| `ai_support` | 1 | 없음 |
| `ordinary_support` | 1 | 없음 |
| `seller_text` | 2 | ① `check_policy`가 `authorityHolders`에 `seller` 포함 반환 ② 덜 침습적인 채널 최소 1회 시도 후 `low_utility` 또는 `no_response` |
| `seller_call` | 3 | ① `seller_text` 시도 기록 존재 ② 그 결과가 `no_response` ③ 문자 발신 후 경과 ≥ 1h ④ 남은 operational time ≤ 2h |

요건 미충족 시 **호출은 실행되지 않고 거부된다**:

```json
{
  "status": "blocked",
  "reason": "escalation_unjustified",
  "missing": ["prior_attempt_on_less_intrusive_channel"],
  "message": "A more intrusive channel requires a recorded failure of a less intrusive one."
}
```

### 성공 시 반환

| channel | 반환 |
|---|---|
| `ai_support` | `{"status":"low_utility","response":"Please choose refund or return."}` |
| `ordinary_support` | `{"status":"no_response"}` |
| `seller_text` | `{"status":"sent","response":null}` |
| `seller_call` | `{"status":"resolved","response":"The extra egg was delivered by mistake. You may keep or consume it. No additional charge.","evidenceId":"seller-call-confirmation","authoritative":true}` |

### 데모에 추가할 3초 장면 (16:00 직전)

agent가 문자 발신 30분 만에 `seller_call`을 시도 → 사이트가 거부:

```
CALL SELLER
  ✕ BLOCKED — escalation_unjustified
    text sent 30m ago · 1h minimum not met
```

→ 대기 → 16:00에 요건 충족 후 재시도 → 성공.

이 장면이 있으면 gating이 `resolve_case` 한 곳의 하드코딩이 아니라 **시스템 전체의 패턴**이라는 게 증명된다. 우선순위 P1.

## 6-4. `resolve_case`

검증: ordered qty evidence + delivered qty evidence + **`authoritative: true`인 keep_allowed evidence**.

미충족:

```json
{
  "status": "blocked",
  "reason": "policy_conflict_requires_discretion",
  "missing": ["authoritative_keep_permission"],
  "message": "Policy conflict cannot be resolved by inference. Authority holder confirmation required."
}
```

충족: `{"status":"resolved","decision":"keep"}`

**시간이 아무리 없어도 이 검증은 완화되지 않는다. 하드코딩된 예외 없음.**

## 6-5. (P2) `pay_seller`

`approved !== true` → `{"status":"confirmation_required","message":"Send ₩3,000 to the seller?"}` / 승인 후 `{"status":"sent","amount":30000}`

---

# 7. Shared action layer

Demo Mode와 WebMCP가 **동일 코드**를 호출해야 한다. 분기 금지.

```
   RUN DEMO ──┐
              ├──► actions.* ──► state ──► UI
  WebMCP tool ┘
```

```ts
actions.inspectCase()
actions.checkPolicy()
actions.contactSupport({ channel })
actions.resolveCase({ decision, evidenceIds })
actions.paySeller({ amount, approved })   // P2
```

심사자가 ChatGPT에서 tool을 호출해도, `RUN DEMO`를 눌러도, 개발 패널 버튼을 눌러도 state 전이가 동일해야 한다.

---

# 8. 의사결정 로직

Agency를 숫자 레벨(`agencyLevel = 1|2|3`)로 모델링하지 말 것.

```ts
if (hasAuthoritativeEvidence()) {
  resolve();
} else if (policyConflict && !agentMayReinterpret) {
  // 스스로 해석하지 않는다
  if (discretionPathIsActive() && remainingTimeIsLarge()) {
    wait();                       // ← 이 분기가 이 프로젝트의 논지
  } else {
    routeToAuthorityHolder({ preferLeastIntrusive: true });
  }
} else if (currentPathHasHighExpectedUtility()) {
  continueCurrentPath();
} else {
  changeChannel();
}
```

"시간 줄었다 → 무조건 전화"가 아니다. **남은 시간 × 기존 경로 성공 가능성 × 채널 침습성** 세 가지를 함께 본다.

---

# 9. Devpost 텍스트 설명 초안

> **Why WebMCP**
> Most WebMCP demos expose what an agent *can* do. This one also defines what an agent *cannot conclude*. Our `check_policy` tool returns a genuine policy contradiction without resolving it, and explicitly tells the agent it has no authority to reinterpret it (`agentMayReinterpret: false`). Our `resolve_case` tool refuses any conclusion not backed by authoritative evidence — even with two minutes left on the deadline. The gating is not limited to the final answer: `contact_support` refuses to escalate to a more intrusive channel unless the site itself holds a record of a less intrusive one having failed. **The agent cannot mint evidence, cannot mint approval, and cannot mint its own authorization to escalate.** Every tool treats agent input as a claim and verifies it against site state. The site owns the guardrail, not the model.
>
> **The problem**
> Korean grocery delivery platforms carry contradictory policies: misdelivered items must be returned, and fresh food cannot be returned. Humans paper over this with heuristics and agent discretion. The result is that a single extra egg goes unresolved for a full day and gets thrown away. Food waste is money. As agents take over more of these interactions, these legacy contradictions surface far more often, not less.
>
> **What people and agents can do together that was hard before**
> A human's 24 hours is not 24 continuous hours — it is fragmented by meetings, missed calls, and support center hours. The agent can use the whole window: it waits while human discretion is still in motion, and shortens the route to the authority holder as the deadline approaches. Escalation here is not privilege expansion. It is distance reduction.
>
> **Implementation**
> Four tools registered via `document.modelContext.registerTool()`, all routed through a single shared action layer that both the demo playback and the live agent invoke. External systems (support center, seller, telephony, payment) are simulated; **tool registration, tool invocation, evidence gating, deadline-dependent routing, and state transitions are real.**

---

# 10. 절대 하지 말 것

로그인 / 회원가입 / 실제 쇼핑몰 / 실제 주문 API / 실제 결제·송금 / 실제 SMS·전화 / multi-agent / dashboard / analytics / 정책 에디터 / agency level UI / DB / 여러 상품 / 여러 유스케이스 / vision inference (사진은 `{"detected":"eggs","count":2}` 하드코딩 목으로 충분)

---

# 11. 완료 조건

**하드 게이트**
- [ ] repo public + LICENSE
- [ ] live URL 접속됨
- [ ] YouTube public, 3분 미만, 오디오 있음

**WebMCP**
- [ ] tool 4개 `registerTool` 등록
- [ ] 실제 agent가 최소 1개 호출 → 화면 state 변경
- [ ] `resolve_case`가 evidence 부족 시 실제로 blocked 반환
- [ ] `resolve_case`가 evidence **개수**가 아니라 저장된 레코드의 `authoritative`/`supports` **내용**으로 검증
- [ ] `contact_support`가 선행 시도 기록 없이 `seller_call` 호출 시 blocked 반환
- [ ] `pay_seller`가 agent의 `approved: true`를 무시하고 `humanConfirmedAt`만 확인 (P2 구현 시)
- [ ] Demo Mode와 WebMCP가 동일 action layer 사용
- [ ] RESET 후 재실행 가능

**논지 전달**
- [ ] operational deadline을 agent가 18:00으로 스스로 당김
- [ ] POLICY CONFLICT 표시
- [ ] **"RESOLVE BY OWN INFERENCE ✕ REFUSED" 프레임이 화면에 명시적으로 존재**
- [ ] **WAIT이 컷이 아니라 지속 배지로 표시됨**
- [ ] LEFT 13:00 상담 장면이 RIGHT의 WAIT과 인과로 연결됨
- [ ] escalation 프레임에 남은 시간이 크게 표시됨
- [ ] seller 확인이 authoritative evidence로 등록됨
- [ ] 최종 RESOLVED

---

# 12. 영상 구성 (90초 권장, 3분 미만 필수)

| 구간 | 내용 |
|---|---|
| 0–15s | 문제 + split screen 소개 |
| 15–30s | human fragmentation 압축 |
| **30–60s** | **실제 agent가 tool 호출하는 raw 화면 — 여기가 심사 점수** |
| 60–80s | 모순 → 우회 거부 → WAIT → escalation → evidence → RESOLVED |
| 80–90s | 최종 슬로건 |

나레이션도 영어로. 반드시 말할 네 문장:
1. "The agent recognizes it has no authority to reinterpret this contradiction."
2. "So while human discretion still has time to arrive, it waits."
3. "As time runs out, it doesn't expand its own authority — it shortens the distance to whoever holds it."
4. "And even at the deadline, the site refuses any conclusion without evidence."
