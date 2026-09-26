import { Scene00Content } from "./contents/scene-00";
import { Scene01Content } from "./contents/scene-01";
import { Scene02Content } from "./contents/scene-02";
import { Scene03Content } from "./contents/scene-03";
import { Scene04Content } from "./contents/scene-04";
import { Scene05Content } from "./contents/scene-05";
import { Scene06Content } from "./contents/scene-06";
import { Scene07Content } from "./contents/scene-07";
import { Scene08Content } from "./contents/scene-08";
import { Scene09Content } from "./contents/scene-09";
import { Scene10Content } from "./contents/scene-10";
import { Scene11Content } from "./contents/scene-11";

/** Frame content per scene, in the comp's order. */
export const SCENE_CONTENTS = [
	Scene00Content,
	Scene01Content,
	Scene02Content,
	Scene03Content,
	Scene04Content,
	Scene05Content,
	Scene06Content,
	Scene07Content,
	Scene08Content,
	Scene09Content,
	Scene10Content,
	Scene11Content,
] as const;
