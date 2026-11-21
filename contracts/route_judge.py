# { "Depends": "py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0" }

# Route Court judge (GenVM v0.4).
# Judges whether an agent's LI.FI route choice broke the user's mandate, using the
# same statement, guidelines and evidence strings the Internet Court agreement holds.
# Every validator re-judges the case independently; consensus forms only when the
# verdicts match. Verdict TRUE means the statement holds: the route broke the
# mandate, so the user is refunded (Internet Court pays party A on TRUE_).

# GenVM v0.4 flattened the SDK: there is no `gl` object any more.
from genlayer import contract, public, nondet, vm, message
from genlayer.storage import TreeMap, DynArray
import json

MAX_FIELD = 4000
VALID_VERDICTS = ("TRUE", "FALSE")


def _parse_ruling(raw) -> dict:
    # exec_prompt(response_format="json") should return a dict, but models sometimes
    # wrap JSON in fences or return text. Never bool() a model string.
    if isinstance(raw, str):
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise vm.UserError("[LLM_ERROR] ruling is not JSON")
        raw = json.loads(raw[start : end + 1])
    if not isinstance(raw, dict):
        raise vm.UserError("[LLM_ERROR] ruling is not an object")
    v = raw.get("statement_is_true", raw.get("verdict"))
    if isinstance(v, str):
        v = v.strip().lower()
        if v in ("true", "yes", "1"):
            v = True
        elif v in ("false", "no", "0"):
            v = False
    if v is not True and v is not False:
        raise vm.UserError("[LLM_ERROR] ruling has no boolean verdict")
    reasoning = str(raw.get("reasoning", "")).strip()[:600]
    return {"verdict": "TRUE" if v else "FALSE", "reasoning": reasoning}


class RouteJudge(contract.Contract):
    # Flat parallel maps keyed by case_ref.
    verdicts: TreeMap[str, str]
    reasonings: TreeMap[str, str]
    statements: TreeMap[str, str]
    snapshot_hashes: TreeMap[str, str]
    agreements: TreeMap[str, str]
    filers: TreeMap[str, str]
    case_refs: DynArray[str]

    def __init__(self):
        pass

    @public.write
    def judge(
        self,
        case_ref: str,
        agreement: str,
        snapshot_sha256: str,
        statement: str,
        guidelines: str,
        evidence_user: str,
        evidence_agent: str,
    ) -> None:
        if not case_ref or len(case_ref) > 64:
            raise vm.UserError("[EXPECTED] bad case_ref")
        if self.verdicts.get(case_ref) is not None:
            raise vm.UserError("[EXPECTED] case already judged")
        if len(snapshot_sha256) != 64:
            raise vm.UserError("[EXPECTED] snapshot_sha256 must be 64 hex chars")
        for name, value in (
            ("statement", statement),
            ("guidelines", guidelines),
            ("evidence_user", evidence_user),
            ("evidence_agent", evidence_agent),
        ):
            if not value or len(value) > MAX_FIELD:
                raise vm.UserError(f"[EXPECTED] {name} empty or over {MAX_FIELD} chars")
        if snapshot_sha256 not in evidence_user or snapshot_sha256 not in evidence_agent:
            raise vm.UserError("[EXPECTED] both evidence strings must quote the snapshot hash")

        prompt = f"""You are a neutral juror in a dispute between a user and the agent the user paid to move funds.

STATEMENT TO RULE ON:
{statement}

GUIDELINES:
{guidelines}

EVIDENCE FROM THE USER:
{evidence_user}

EVIDENCE FROM THE AGENT:
{evidence_agent}

How to judge:
- The cost, time and hop numbers were computed by code from a frozen, hashed snapshot of the routes LI.FI offered. Treat them as correct.
- Your job is the part code cannot decide: whether the agent's choice honours the words of the mandate ("cheapest sensible", "do not overpay for speed", "real money"), given the alternatives that really existed.
- Weigh both positions. Do not reward rhetoric; rule on the numbers and the mandate's wording.

Respond with JSON only, exactly this shape:
{{"statement_is_true": true or false, "reasoning": "two to four sentences naming the deciding facts"}}"""

        def leader() -> dict:
            return _parse_ruling(nondet.exec_prompt(prompt, response_format="json"))

        def validator(leader_result) -> bool:
            if not isinstance(leader_result, vm.Return):
                return False
            mine = leader()  # independent re-judgment, not a format check
            return mine["verdict"] == leader_result.calldata["verdict"]

        ruling = vm.run_nondet(leader, validator)

        if ruling["verdict"] not in VALID_VERDICTS:
            raise vm.UserError("[EXPECTED] invalid verdict")
        self.verdicts[case_ref] = ruling["verdict"]
        self.reasonings[case_ref] = ruling["reasoning"]
        self.statements[case_ref] = statement
        self.snapshot_hashes[case_ref] = snapshot_sha256
        self.agreements[case_ref] = agreement.lower()
        self.filers[case_ref] = message.sender_address.as_hex.lower()
        self.case_refs.append(case_ref)

    @public.view
    def get_case(self, case_ref: str) -> str:
        v = self.verdicts.get(case_ref)
        if v is None:
            return json.dumps({"case_ref": case_ref, "judged": False})
        return json.dumps(
            {
                "case_ref": case_ref,
                "judged": True,
                "verdict": v,
                "reasoning": self.reasonings.get(case_ref, ""),
                "statement": self.statements.get(case_ref, ""),
                "snapshot_sha256": self.snapshot_hashes.get(case_ref, ""),
                "agreement": self.agreements.get(case_ref, ""),
                "filer": self.filers.get(case_ref, ""),
            }
        )

    @public.view
    def get_case_refs(self) -> str:
        return json.dumps([r for r in self.case_refs])
