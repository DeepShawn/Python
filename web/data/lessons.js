// Python Nexus 课程数据。
// 每个阶段对应设计方案 2.2 节的课程规划；lessons 为已完成的课时，其余为规划中内容。
// 课时结构：知识讲解 → 可执行示例 → 运行过程动画 → 练习 → 自动评测。

export const COURSE = [
  {
    stage: "零基础", hours: 20,
    topics: ["print 输出", "input 输入", "变量", "数据类型", "类型转换"],
    lessons: [
      {
        id: "l-print", title: "第一个程序：print()",
        body: `
<p><code>print()</code> 是 Python 的内置函数，用来把内容输出到控制台。文字（字符串）要放在引号里，数字不需要。</p>
<ul>
  <li>多个值用逗号分隔，输出时自动以空格隔开；</li>
  <li><code>sep=</code> 改变分隔符，<code>end=</code> 改变结尾（默认换行）。</li>
</ul>
<p>点击「可视化运行」，观察每一行如何依次执行，输出如何逐步出现在控制台。</p>`,
        code: `print("Hello, World!")
print("我今年", 18, "岁")
print("A", "B", "C", sep="-")
print("不换行", end=" → ")
print("继续")`,
        practice: "q-print-1",
      },
      {
        id: "l-vars", title: "变量与赋值",
        body: `
<p>变量是数据的名字。<code>=</code> 表示「把右边的值赋给左边的名字」，不是数学中的相等。</p>
<p>运行下面的程序，在右侧「变量」面板中观察 <code>x</code>、<code>y</code>、<code>z</code> 被逐个创建，以及 <code>x</code> 被重新赋值时的变化。</p>`,
        code: `x = 3
y = 5
z = x + y
print(z)
x = x * 10
print(x, y, z)`,
      },
      {
        id: "l-input", title: "input() 与类型转换",
        body: `
<p><code>input()</code> 读取用户输入，结果<strong>永远是字符串</strong>。做数学运算前需要用 <code>int()</code> 或 <code>float()</code> 转换。</p>
<p>离线环境中，程序的输入写在底部「标准输入」面板里，每一行对应一次 <code>input()</code>。本课已预填输入。</p>`,
        code: `name = input("你的名字: ")
age = int(input("你的年龄: "))
print(name, "明年", age + 1, "岁")
print(type(age))`,
        stdin: "小明\n17",
        practice: "q-type-1",
      },
    ],
  },
  {
    stage: "基础语法", hours: 35,
    topics: ["运算符", "条件判断", "循环", "字符串", "列表 / 元组 / 字典 / 集合"],
    lessons: [
      {
        id: "l-if", title: "条件判断 if / elif / else",
        body: `
<p><code>if</code> 根据条件选择执行哪一段代码。冒号后面的代码块必须<strong>缩进</strong>（通常 4 个空格）。</p>
<p>点击「流程图」查看这段代码自动生成的控制流程图，再用「可视化运行」观察实际走了哪一条分支。修改标准输入中的数字再试一次。</p>`,
        code: `n = int(input("n: "))
if n % 2 == 0:
    print("偶数")
else:
    print("奇数")`,
        stdin: "7",
        practice: "p-parity",
      },
      {
        id: "l-loop", title: "for 与 while 循环",
        body: `
<p><code>for</code> 遍历一个序列，<code>while</code> 在条件为真时重复执行。<code>range(a, b)</code> 生成从 a 到 b-1 的整数。</p>
<p>可视化运行时注意：循环头所在的行会被反复执行，这正是执行追踪器按<em>真实执行顺序</em>回放的效果。</p>`,
        code: `total = 0
for i in range(1, 6):
    total += i
print("1 到 5 的和:", total)

n = 3
while n > 0:
    print("倒计时", n)
    n -= 1
print("发射！")`,
      },
      {
        id: "l-list", title: "列表与字典",
        body: `
<p>列表 <code>[]</code> 是有序、可修改的序列；字典 <code>{}</code> 保存「键 → 值」映射。</p>`,
        code: `fruits = ["苹果", "香蕉"]
fruits.append("橙子")
print(fruits, len(fruits))

scores = {"小明": 90}
scores["小红"] = 95
for name, s in scores.items():
    print(name, s)`,
        practice: "q-container-1",
      },
    ],
  },
  {
    stage: "函数编程", hours: 25,
    topics: ["函数定义", "参数与返回值", "作用域", "递归", "异常处理"],
    lessons: [
      {
        id: "l-func", title: "定义函数",
        body: `
<p><code>def</code> 定义函数，<code>return</code> 返回结果。函数内部创建的变量是<strong>局部变量</strong>。</p>
<p>可视化运行时，右侧「调用栈」会显示每次进入和离开函数。</p>`,
        code: `def greet(name):
    message = f"Hello, {name}!"
    return message

print(greet("World"))
print(greet("Python"))`,
        practice: "q-scope-1",
      },
      {
        id: "l-recursion", title: "递归",
        body: `
<p>函数调用自己叫做递归。递归必须有<strong>终止条件</strong>，否则会无限调用。</p>
<p>观察调用栈如何一层层加深，再在遇到 <code>return</code> 后逐层返回。</p>`,
        code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))`,
        practice: "p-fact",
      },
      {
        id: "l-except", title: "异常处理 try / except",
        body: `
<p>程序出错时会抛出异常。用 <code>try / except</code> 捕获它，让程序继续运行。</p>`,
        code: `def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        print("除数不能为 0")
        return None
    finally:
        print("计算结束")

print(safe_div(6, 3))
print(safe_div(1, 0))`,
      },
    ],
  },
  {
    stage: "进阶编程", hours: 35,
    topics: ["文件读写", "模块与包", "面向对象", "迭代器与生成器"],
    lessons: [
      {
        id: "l-class", title: "类与对象",
        body: `<p><code>class</code> 定义类，<code>__init__</code> 初始化对象，<code>self</code> 指向对象本身。</p>`,
        code: `class Counter:
    def __init__(self):
        self.value = 0

    def add(self, n=1):
        self.value += n
        return self.value

c = Counter()
c.add()
c.add(5)
print(c.value)`,
      },
      {
        id: "l-module", title: "模块化：多文件项目",
        body: `
<p>把函数放进独立的 <code>.py</code> 文件，再用 <code>import</code> 导入，就是模块化编程。</p>
<p>点击「在编辑器中打开」会创建 <code>calculator.py</code>，然后运行 <code>main.py</code>。在流程图面板中可以看到模块导入关系。</p>`,
        code: `from calculator import add, mul

print(add(2, 3))
print(mul(4, 5))`,
        files: {
          "calculator.py": `def add(a, b):
    return a + b


def mul(a, b):
    return a * b
`,
          "tests/test_calculator.py": `import unittest
from calculator import add, mul


class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)

    def test_mul(self):
        self.assertEqual(mul(4, 5), 20)
`,
        },
      },
    ],
  },
  {
    stage: "标准库", hours: 35,
    topics: ["math", "random", "json", "datetime", "os / pathlib", "collections"],
    lessons: [
      {
        id: "l-json", title: "json 与 collections",
        body: `<p>标准库无需安装，离线可用。<code>json</code> 处理 JSON 文本，<code>collections.Counter</code> 统计次数。</p>`,
        code: `import json
from collections import Counter

text = '{"name": "Nexus", "tags": ["python", "offline", "python"]}'
data = json.loads(text)
print(data["name"])
print(Counter(data["tags"]).most_common(1))
print(json.dumps(data, ensure_ascii=False))`,
      },
    ],
  },
  {
    stage: "算法与结构", hours: 40,
    topics: ["排序", "查找", "栈与队列", "递归与分治", "复杂度分析"],
    lessons: [
      {
        id: "l-binsearch", title: "二分查找",
        body: `<p>在<strong>有序</strong>列表中查找，每次排除一半，时间复杂度 O(log n)。用可视化运行观察 <code>lo</code>、<code>hi</code>、<code>mid</code> 如何变化。</p>`,
        code: `def binary_search(items, target):
    lo, hi = 0, len(items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if items[mid] == target:
            return mid
        elif items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

print(binary_search([1, 3, 5, 7, 9, 11], 9))`,
        practice: "p-bubble",
      },
    ],
  },
  {
    stage: "第三方库", hours: 35,
    topics: ["NumPy", "pandas", "Matplotlib"],
    lessons: [],
    note: "网页版通过 Pyodide 离线包加载（需随应用打包对应 wheel），Windows 版随嵌入式 CPython 打包。",
  },
  {
    stage: "实战应用", hours: 35,
    topics: ["自动化脚本", "数据处理", "离线爬虫（本地 HTML 样本）", "项目开发"],
    lessons: [
      {
        id: "l-crawler", title: "离线爬虫：解析本地 HTML",
        body: `
<p>严格离线模式下不访问互联网，而是解析内置的 HTML 样本。这里用标准库 <code>html.parser</code> 提取标题和链接，
后续课程会使用 BeautifulSoup、正则和 XPath。</p>`,
        code: `from html.parser import HTMLParser

PAGE = """
<html><body>
  <h1>Python Nexus 新闻</h1>
  <a href="/news/1">离线 IDE 发布</a>
  <a href="/news/2">流程图功能上线</a>
</body></html>
"""

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self._href = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")

    def handle_data(self, data):
        if self._href and data.strip():
            self.links.append((data.strip(), self._href))
            self._href = None

p = LinkParser()
p.feed(PAGE)
for title, href in p.links:
    print(title, "->", href)`,
      },
    ],
  },
];
