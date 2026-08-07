---
title: A drivetrain calculator for every FTC team
date: 2026-08-05
description: We built a gearing simulator for our own drive team, rebuilt it after a review found fourteen flaws, and now it is free for any team to use.
author: GNCE Onyx
---

Every drive team has the same argument in the pit: gear for speed or gear for punch. The napkin math most teams settle it with ignores the parts that decide real matches. Battery sag. The 20 amp main fuse. Whether the wheels grip before they slip. The stop at the end of every leg.

So we built a calculator that models all of it, and we are giving it to everyone. You can [use it now](/GNCE-Onyx/drivetrain/), free, in the browser, nothing to install.

Tell it your robot: weight, wheels, battery, motor, gearing. It runs your sprint or cycle in field tiles, names the limit that is actually holding you back, and recommends gearing you can order, a cartridge plus a tooth pair, not a motor speed nobody sells. Verdicts come as windows instead of decimal points, because the constants underneath are honest ranges. And when you want the truth about your own robot, paste an encoder log over the model's chart and the page tells you which constant to move.

Ethan wrote the first version for our own drive team in July. A reviewer took it apart, fourteen numbered flaws, three of them fatal, and the rebuild is what you see today. The whole story is in [his write-up](https://darkelights.pages.dev/blog/calculating-the-ideal-drivetrain).

If your team uses it and something reads wrong, tell us. One good encoder log makes the model better for everyone.
