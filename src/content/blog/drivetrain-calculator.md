---
title: A drivetrain calculator for every FTC team
date: 2026-08-05
description: We built a gearing simulator for our own drive team, sharpened it over many rounds, and now it is free for any team to use.
author: GNCE Onyx
---

Every drive team has the same argument in the pit: gear for speed or gear for punch. The napkin math most teams settle it with ignores the parts that decide real matches. Battery sag. The 20 amp main fuse. Whether the wheels grip before they slip. The stop at the end of every leg.

So we built a calculator that models all of it, and we are giving it to everyone. You can [use it now](/GNCE-Onyx/drivetrain/), free, in the browser, nothing to install.

Tell it your robot: weight, wheels, battery, motor, gearing. Then give it a path. It reads real Pedro Pathing chains, Pedro 3 paths or last season's pathBuilder code, and drives them across a full field on your drivetrain. You get the time for that run, the stretches where the corners and not the motors are costing you, gearing you can order (a cartridge plus a tooth pair, not a motor speed nobody sells), and the heaviest robot you can shove off its spot. Verdicts come as windows instead of decimal points, because the constants underneath are honest ranges.

If that gearing runs through a belt, the [belt calculator](/GNCE-Onyx/belt/) finishes the job: type the two pulleys and either the spacing or the belt, and it solves the rest, then lists the nearest belts you can actually buy and who sells them.

Ethan Zhang wrote the first version for our own drive team in July, and what shipped is many rounds past it. We kept iterating through the summer, and every pass sharpened the model and made its answers easier to act on.

If your team uses it and something reads wrong, tell us. The constants it runs on are published figures, not measurements off your robot, so real numbers from a real pit make the model better for everyone.
