"""Nebius Token Factory 비전 모델 호출 시험 (이미지 1건).

확인하는 것: ① 키로 모델 목록이 조회되는지 ② Nemotron/VL 계열 모델이 목록에 있는지 ③ 이미지 1장을 보내 응답이 오는지.

사용:
  1) 키는 환경 변수로만 넣는다(코드·채팅에 적지 않는다).
       PowerShell : $env:NEBIUS_API_KEY = "..."
       bash       : export NEBIUS_API_KEY=...
  2) 목록만 확인           : python scripts/nebius_vision_probe.py --list
  3) 이미지 1건 호출       : python scripts/nebius_vision_probe.py --model "<목록에서 확인한 ID>" --image path/to/photo.jpg
     (--image 에 https:// 주소를 줘도 된다)

주의: base URL 과 이미지 입력 형식은 Nebius 문서에서 직접 확인하지 못한 값이다. 오류가 나면 --base-url 로 바꿔 보고 문서와 대조한다.
"""
from __future__ import annotations

import argparse
import base64
import mimetypes
import os
import sys
import time
from pathlib import Path

DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1/"
PROMPT = (
    "이 사진은 교통사고 현장 증거 사진 후보입니다. 다음을 나눠서 답하세요.\n"
    "1) 사진에서 보이는 것: 차량 수, 보이는 면, 손상 부위(보이는 것만)\n"
    "2) 장면 유형: 현장 전체 / 차량 전체 / 번호판 / 손상 근접 / 도로 상태 / 서류 / 기타\n"
    "3) 품질: 선명한지, 어둡거나 흐린지, 번호판 글자가 읽히는지\n"
    "4) 보이지 않아 알 수 없는 것: 추측하지 말고 따로 적기\n"
    "금액·과실·법적 책임은 판단하지 마세요."
)


def image_part(src: str) -> dict:
    if src.startswith(("http://", "https://")):
        return {"type": "image_url", "image_url": {"url": src}}
    path = Path(src)
    if not path.is_file():
        sys.exit(f"이미지 파일이 없습니다: {src}")
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode()
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=os.environ.get("NEBIUS_BASE_URL", DEFAULT_BASE_URL))
    ap.add_argument("--list", action="store_true", help="모델 목록만 조회")
    ap.add_argument("--model", help="호출할 모델 ID(목록에서 확인한 값 그대로)")
    ap.add_argument("--image", help="이미지 파일 경로 또는 https 주소")
    ap.add_argument("--prompt", default=PROMPT)
    ap.add_argument("--max-tokens", type=int, default=2000)
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    key = os.environ.get("NEBIUS_API_KEY")
    if not key:
        sys.exit("NEBIUS_API_KEY 환경 변수가 없습니다. (키를 이 스크립트나 채팅에 적지 마세요)")

    from openai import OpenAI

    client = OpenAI(base_url=args.base_url, api_key=key, timeout=60, max_retries=0)

    if args.list or not (args.model and args.image):
        try:
            ids = sorted(m.id for m in client.models.list())
        except Exception as e:  # noqa: BLE001 — 시험 스크립트: 원인을 그대로 보여 준다
            sys.exit(f"모델 목록 조회 실패: {type(e).__name__}: {e}")
        print(f"모델 {len(ids)}개 조회됨")
        hits = [i for i in ids if any(k in i.lower() for k in ("nemotron", "vl", "vision", "cosmos"))]
        print("Nemotron/VL/Cosmos 계열 후보:" if hits else "Nemotron/VL/Cosmos 계열이 목록에 없습니다.")
        for i in hits:
            print("  ", i)
        if not (args.model and args.image):
            print("\n이미지 호출은 --model 과 --image 를 함께 주면 실행됩니다.")
            return

    content = [image_part(args.image), {"type": "text", "text": args.prompt}]   # 이미지를 텍스트보다 앞에
    started = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=args.model, messages=[{"role": "user", "content": content}], max_tokens=args.max_tokens
        )
    except Exception as e:  # noqa: BLE001
        sys.exit(f"호출 실패: {type(e).__name__}: {e}")
    sec = time.perf_counter() - started

    usage = getattr(resp, "usage", None)
    print(f"\n[응답 {sec:.1f}s | 입력 {getattr(usage, 'prompt_tokens', '?')} / 출력 {getattr(usage, 'completion_tokens', '?')} 토큰]\n")
    choice = resp.choices[0]
    msg = choice.message
    print(f"finish_reason={choice.finish_reason}")
    reasoning = getattr(msg, "reasoning_content", None) or getattr(msg, "reasoning", None)
    if reasoning:
        print(f"[추론 텍스트 {len(reasoning)}자 — 앞 300자]\n{reasoning[:300]}\n")
    print(msg.content)
    print("\n판정 기준: 응답이 오고, 사진 내용을 설명하고, 보이지 않는 것을 지어내지 않으면 통과.")


if __name__ == "__main__":
    main()
