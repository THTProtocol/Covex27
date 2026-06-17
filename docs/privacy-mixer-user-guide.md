# Privacy Mixer - Status: NOT OFFERED

## Covex does not operate a mixer

Covex offers **no first-party privacy mixer**. There is no Covex-hosted pool,
no deposit endpoint, and no withdrawal service. The backend deliberately does
not mount any `/api/mixer/*` route (see `backend/src/main.rs`, the comment that
begins "Covex offers NO first-party mixer (legal/sanctions posture)").

Any earlier instructions that pointed at `https://hightable.pro/api/mixer/...`
are obsolete. Those endpoints do not exist and will not respond.

## Why

Operating or hosting an anonymizing value-pool carries money-transmission and
sanctions exposure that Covex does not take on. Covex is neutral software for
discovering and interacting with on-chain Kaspa covenants; it does not run a
mixing service.

## If you are researching the design

The historical circuit and design notes are kept for reference only in
`docs/privacy-mixer-design.md`. They describe a covenant a user could build and
operate entirely themselves, with that user carrying all responsibility and
liability. Nothing in those notes is a Covex-hosted service, and Covex does not
deploy, fund, or operate such a covenant on anyone's behalf.
