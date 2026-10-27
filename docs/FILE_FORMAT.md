# .nad 工程格式

当前工程格式为 UTF-8 JSON，`format` 为 `NaDraw`，格式版本字段为数字 `2`。软件版本与文件格式版本是不同概念。文件后缀为 `.nad`，旧 `.chd` 可按兼容路径导入。

最小示例：

```json
{
  "format": "NaDraw",
  "version": 2,
  "atoms": [
    {"id":"a1","x":0,"y":0,"element":"C","explicit":false,"charge":0},
    {"id":"a2","x":24,"y":0,"element":"O","explicit":true,"charge":0}
  ],
  "bonds": [
    {"id":"b1","a":"a1","b":"a2","order":2,"style":"normal","doubleLayout":"center"}
  ],
  "decorations": [],
  "settings": {"bondLength":24,"grid":false}
}
```

## 原子 atoms

`id` 为文档内唯一标识，`x/y` 为世界坐标，`element` 为元素符号，`explicit` 表示是否显式标注元素。可选的 `charge/chargeStyle` 保存电荷，`labelOverride/labelSize/labelColor` 保存用户编辑的标签。

## 键 bonds

`a/b` 引用两个原子 ID；`order` 为 1、2 或 3；`style` 为 `normal`、`wedge`、`hollow` 或 `hash`。楔形表示不等于多键。`doubleLayout` 可取 `center/left/right`，未设置时按连接关系自动排布；不改变逻辑端点和价态。

## 装饰 decorations

- 箭头：`type:"arrow"`，`points` 保存世界坐标点，`pathMode` 为 straight/curve/polyline，`lineStyle` 为 solid/dashed，`headStyle` 为 full/fishhook。
- 括号：`type:"bracket"`，使用 `x1/y1/x2/y2`、`style` 和可选的 `label`。
- 文字：`type:"text"`，使用 `x/y/value/size/color`，可保存对齐、基线和吸附标记。
- 点位、电荷和过渡态：`mark/charge/transition` 分别保存坐标及其样式字段。

轨道不再是本版的可创建对象。旧文件中的此类对象在导入时转换为可编辑占位文字，原 `.nad` 文件不会因打开而自动改写；保存前可另存保留原文件。

## 设置与兼容

`settings` 保存键长、网格、辅助开关、视口和默认文字样式。它不是机器路径或登录信息。导入器支持当前 atoms/bonds 格式，以及早期 `objects` 格式的基础键和文字转换；不承诺恢复已经移除的旧图片素材。

请保留原子 ID 的引用完整性，避免自环、缺失端点和重复键。当前读取器不属于严格完整的外部化学格式验证器，不支持 SMILES、MOL、CDXML 等互换格式。
