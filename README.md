# threejs-plateau-walk-demo
Live Demo（PC専用　マウス+WSAD）
https://gisshy483509.github.io/threejs-plateau-walk-demo/

Three.js でPLATEAUの横浜のモデル内を歩ける機能の作成検証
PLATEAU モデルをPLATEAU_SDKにてgltf形式にて出力し、Three.jsにて都市の中を歩いて見れる作成検証をしています。

## 主な特徴
- PCのみで操作ください。（ios,Android端末での操作は想定していません）
- アバターとして、PLATAEUのベースのモデルを歩き回れるようにしています。
- Three.jsのサンプルモデルのhttps://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Xbot.glbをアバターとして使用しています。
- 操作はWASDで移動することができます。
- 建物は青色でwirflameで発行するようにしました。
- 建物(bldg)、橋梁(bridge)、地形面(dem)でデータを分け、橋梁と地形面については衝突判定を設定しています。

## PLATEAUモデルについて
- PLATEAUモデルは通常ポリメッシュのような形式で出力されるため、メッシュの面のため、blenderでモディファイア（ボクセル）を使用して形状を整えています。

引用・参考記事
Three.jsで新宿駅構内の3D探索ゲームを作ってみる
https://qiita.com/satoshi7190/items/67148db8b3149e73c4b0
上記記事を詳しく参考にさせていただいております。感謝申し上げます。
