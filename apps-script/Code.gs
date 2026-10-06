/**
 * 중2 닮음 & 피타고라스 학습 앱 — 구글 시트 수신용 Apps Script
 *
 * 설치 (자세한 내용은 README.md 의 "구글 시트 연동 설정"):
 *  1) 구글 시트 생성 → 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 저장
 *  2) 위쪽 함수 선택에서 setup 선택 → 실행 → 권한 승인 (탭과 머리글이 만들어짐)
 *  3) 배포 → 새 배포 → 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자
 *  4) 발급된 https://script.google.com/macros/s/.../exec 주소를 js/config.js 에 입력
 *
 * 앱은 GET(JSONP) 방식으로 보내고 저장 결과 { ok: true } 를 돌려받아 "저장 완료"를 확인합니다.
 * (POST 방식도 계속 지원)
 */

const RESULT_SHEET = "학습결과";

const RESULT_HEADERS = [
  "수신시각", "세션ID", "시작시각", "완료시각", "학습시간", "학습시간(초)",
  "전체문항", "풀이문항", "정답수", "총점",
  "1.닮음과 성질", "2.닮음 조건", "3.평행선&무게중심", "4.넓이·부피의 비", "5.피타고라스 정리",
  "칭찬도장", "보유 도토리", "누적 도토리", "OX 정답", "실험실 미션"
];

/** 처음 한 번 직접 실행: 탭/머리글 생성 + 권한 승인 */
function setup() {
  getSheet_(RESULT_SHEET, RESULT_HEADERS);
  Logger.log("준비 완료! 이제 [배포 → 새 배포 → 웹 앱]으로 배포하세요.");
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  let res;
  if (p.payload) {
    res = handle_(p.payload);
  } else {
    // 연결 확인 (브라우저로 /exec 주소를 열거나 앱의 연결 상태 확인)
    res = {
      ok: true,
      message: "닮음 & 피타고라스 학습 앱 수신 서버가 동작 중입니다.",
      spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName()
    };
  }
  return output_(res, p.callback);
}

function doPost(e) {
  return output_(handle_(e && e.postData ? e.postData.contents : ""));
}

/** 받은 JSON 문자열을 알맞은 탭에 한 줄로 기록 */
function handle_(raw) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const data = JSON.parse(raw);
    const now = new Date();

    if (data.type === "result") {
      const unitScores = (data.units || []).map(function (u) {
        return u.score + "점 (" + u.correct + "/" + u.total + ")";
      });
      getSheet_(RESULT_SHEET, RESULT_HEADERS).appendRow([
        now, data.sessionId, data.startedAt, data.completedAt,
        data.duration, data.durationSec,
        data.totalQuestions, data.answered, data.correct, data.totalScore
      ].concat(unitScores, [
        data.stamps, data.acorns, data.acornsEarned,
        data.oxCorrect + "/" + data.oxTotal, data.labsDone + "/5"
      ]).map(safe_));
    } else {
      return { ok: false, error: "unknown type" };
    }
    return { ok: true, type: data.type };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** 탭이 없으면 만들고, 머리글이 비었거나 예전 버전이면 최신 머리글로 맞춤 */
function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const range = sheet.getRange(1, 1, 1, headers.length);
  const current = sheet.getLastRow() === 0 ? [] : range.getValues()[0];
  if (current.join("|") !== headers.join("|")) {
    range.setValues([headers]).setFontWeight("bold").setBackground("#e8eeff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 받은 글자가 수식(=, +, -, @)으로 실행되지 않도록 막기 */
function safe_(v) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

/** callback 이 있으면 JSONP(자바스크립트), 없으면 JSON 으로 응답 */
function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][\w$]{0,63}$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
