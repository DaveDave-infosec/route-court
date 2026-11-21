# GenVM v0.4 notes (verified on Studio Next v0.123.0-rc.13, GenVM v0.4.0-rc1, 2026-11-21)

Runner: `py-genlayer:kzybg95x1gn21dw72m7hyg0maaap04n4nx55j9yt6fkdqxtz6bz0`

1. There is no `gl` object. `from genlayer import *` exports flat modules:
   contract, public, nondet, eq_principle, vm, message, storage, chain, evm, Address, u256 ...
   - `gl.Contract`            -> `contract.Contract`
   - `gl.public.view/write`   -> `public.view` / `public.write`
   - `gl.nondet.exec_prompt`  -> `nondet.exec_prompt` (kwargs: response_format "text"|"json", images)
   - `gl.eq_principle.*`      -> `eq_principle.*`
   - `gl.vm.UserError/Return` -> `vm.UserError` / `vm.Return`
   - `gl.vm.run_nondet_unsafe`-> gone; use `vm.run_nondet(leader, validator)`
   - `gl.message.sender_address` -> `message.sender_address` (Address: as_hex, as_bytes, as_int)
   - `TreeMap`, `DynArray`    -> `from genlayer.storage import TreeMap, DynArray`
   - `gl.contract_address` now exists as `message.contract_address`
2. The runner header is read from the whole leading block of `#` lines.
   Any comment line directly under the Depends line makes the header "runner malformed".
   Leave a blank line after line 1.
3. Studio's "Could not load contract schema" hides the real error. The JSON-RPC
   method `gen_getContractSchemaForCode` on https://studio-next.genlayer.com/api
   returns the full traceback.
